import openpyxl

wb_val = openpyxl.load_workbook(r'D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\AHSP 2026 Bina Marga.xlsx', data_only=True)
ws_dhsp = wb_val['DHSP']

for r in range(6, 25):
    print(f'Row {r}: {[ws_dhsp.cell(r, c).value for c in range(1, 10)]}')
