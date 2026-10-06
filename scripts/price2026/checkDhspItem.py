with open('src/data/nationalCostDatabase/officialBinaMargaDhsp2026.ts', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('"2.1.(1)"')
if idx != -1:
    print('Found at', idx)
    print(text[idx-20:idx+2000])
else:
    print('Not found!')
