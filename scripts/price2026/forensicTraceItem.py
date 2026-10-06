import openpyxl

wb_val = openpyxl.load_workbook(r'D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\AHSP 2026 Bina Marga.xlsx', data_only=True)
wb_form = openpyxl.load_workbook(r'D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\AHSP 2026 Bina Marga.xlsx', data_only=False)

# Let's inspect DHSP sheet
ws_dhsp = wb_val['DHSP']
print('--- DHSP SEARCH ---')
for r in range(1, 50):
    vals = [ws_dhsp.cell(r, c).value for c in range(1, 15)]
    # filter None
    if any(vals):
        # check if 2.1 is in any string
        if any('2.1' in str(v) for v in vals if v):
            print(f'DHSP Row {r}: {vals}')

# Let's inspect B - Drainase sheet
ws_b_val = wb_val['B - Drainase']
ws_b_form = wb_form['B - Drainase']

print('--- B - Drainase SEARCH ---')
for r in range(1, ws_b_val.max_row + 1):
    for c in range(1, 10):
        v = str(ws_b_val.cell(r, c).value or '')
        if '2.1' in v or 'Drainase' in v:
            print(f'Match at row {r}, col {c}: {repr(v)}')
            # print rows r-2 to r+30
            for row_idx in range(max(1, r-2), min(ws_b_val.max_row, r+35)):
                v_list = [ws_b_val.cell(row_idx, col).value for col in range(1, 12)]
                f_list = [ws_b_form.cell(row_idx, col).value for col in range(1, 12)]
                print(f'R{row_idx} VAL: {v_list}')
                print(f'R{row_idx} FORM: {f_list}')
            break
    else:
        continue
    break
