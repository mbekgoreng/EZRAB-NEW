import openpyxl

wb = openpyxl.load_workbook(r'D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\AHSP 2026 Bina Marga.xlsx', data_only=False)
print('Defined names:')
for name, defn in wb.defined_names.items():
    print(name, defn.value, defn.destinations)

ws_upah = wb['Upah Bahan']
print('\nUpah Bahan first 15 rows:')
for r in range(1, 15):
    print([ws_upah.cell(r, c).value for c in range(1, 10)])

# Check sheet DHSP
ws_dhsp = wb['DHSP']
print('\nDHSP first 15 rows:')
for r in range(1, 15):
    print([ws_dhsp.cell(r, c).value for c in range(1, 10)])
