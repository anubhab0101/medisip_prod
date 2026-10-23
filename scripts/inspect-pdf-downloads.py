"""Inspect the actual downloads made by verify-pdf-downloads.mjs."""
from pathlib import Path
import json
import pdfplumber
from pypdf import PdfReader

root = Path('.local/pdf-check')
results = []
for width in (1280, 360):
    for kind in ('invoice', 'report'):
        file = root / f'{kind}-{width}.pdf'
        reader = PdfReader(file)
        text = '\n'.join(page.extract_text() or '' for page in reader.pages)
        assert '/OpenAction' not in reader.trailer['/Root']
        assert '/AA' not in reader.trailer['/Root']
        for page in reader.pages:
            assert not page.get('/Annots'), 'PDF must contain no clickable links, forms or actions'
        if kind == 'invoice':
            assert len(reader.pages) >= 3, 'Long invoice must paginate'
            for i in range(1, 66):
                assert f'ITEM-{i:03}' in text, f'Missing item {i}'
            for expected in ('Saved shop', 'TEST-GST', 'TEST-LICENCE', 'PDF-TEST-0001', 'Recorded test return', 'Recorded returns', '8,02,468.55'):
                assert expected in text, f'Missing saved invoice field: {expected}'
            for secret in ('PRIVATE-PRESCRIPTION', 'PRIVATE-DOCTOR', 'PRIVATE-CUSTOMER', '+919999999999'):
                assert secret not in text, 'Private staff/customer field leaked'
            assert 'दवा' in text and 'ଔଷଧ' in text, 'Indian-language text missing'
            for page in reader.pages:
                page_text = page.extract_text() or ''
                if 'ITEM-' in page_text:
                    assert 'Medicine / batch / expiry' in page_text, 'Missing repeated table header'
                    assert page_text.count('ITEM-') == page_text.count('Batch: TEST-ONLY'), 'An item was split across pages'
            assert not any('Different shop' in line for line in text.splitlines())
        else:
            assert 'Expiry & stock' in text and 'PDF fixture medicine' in text
            assert float(reader.pages[0].mediabox.width) > float(reader.pages[0].mediabox.height)
        with pdfplumber.open(file) as pdf:
            for page in pdf.pages:
                assert all(char['x0'] >= 28 and char['x1'] <= page.width - 28 for char in page.chars), 'Text outside page margins'
                assert all(char['top'] >= 24 and char['bottom'] <= page.height - 12 for char in page.chars), 'Text outside page height'
                assert not any(char['text'] == '\x00' for char in page.chars), 'Missing glyph'
        results.append({'file': file.name, 'pages': len(reader.pages), 'fieldsAndMargins': True, 'noLinksOrActions': True})
(root / 'inspection-result.json').write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
