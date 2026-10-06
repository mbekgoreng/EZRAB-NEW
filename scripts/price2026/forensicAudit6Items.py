import openpyxl

wb = openpyxl.load_workbook(r'D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\AHSP 2026 Bina Marga.xlsx', data_only=False)
wb_val = openpyxl.load_workbook(r'D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\AHSP 2026 Bina Marga.xlsx', data_only=True)

# Test items across categories
target_codes = [
    ('2.1.(1)', 'B - Drainase', 'Drainase'),
    ('2.3.(1)', 'B - Drainase', 'Drainase'),
    ('3.1.(1)', 'C - Tanah dan Geosintetik', 'Tanah'),
    ('5.1.(1)', 'E - Perkerasan Berbutir dan Per', 'Perkerasan Berbutir'),
    ('6.1.(1)', 'F - Perkerasan Aspal', 'Aspal'),
    ('7.1.(1)', 'G - Struktur', 'Struktur'),
]

for code, sheet_name, category in target_codes:
    ws = wb[sheet_name]
    print('='*70)
    print(f'CATEGORY: {category} | TARGET AHSP CODE: {code} | SHEET: {sheet_name}')
    print('='*70)
    
    # Find row with code in Col M or in header
    found_row = None
    for r in range(1, ws.max_row + 1):
        c_m = str(ws.cell(r, 13).value or '').strip()
        c_c = str(ws.cell(r, 3).value or '').strip()
        c_d = str(ws.cell(r, 4).value or '').strip()
        if c_m == code or (code in c_d and ws.cell(r, 11).value):
            found_row = r
            break
            
    if not found_row:
        # Search anywhere in row
        for r in range(1, ws.max_row + 1):
            if any(code == str(ws.cell(r, c).value or '').strip() for c in range(1, 15)):
                found_row = r
                break
                
    if not found_row:
        print(f'CODE {code} NOT FOUND IN {sheet_name}!')
        continue
        
    print(f'Header block at Row {found_row}:')
    header_vals = [ws.cell(found_row, c).value for c in range(1, 15)]
    print('  Vals:', header_vals)
    
    # Read until next analysis block or empty
    for r in range(found_row + 1, found_row + 45):
        c_c = ws.cell(r, 3).value
        c_d = ws.cell(r, 4).value
        c_k = ws.cell(r, 11).value
        c_m = ws.cell(r, 13).value
        
        # Check if next block starts
        if r > found_row + 3 and c_k and str(c_k).startswith('=ROUNDDOWN'):
            break
            
        row_vals = [ws.cell(r, c).value for c in range(1, 12)]
        if any(row_vals):
            print(f'  R{r}: {row_vals}')
