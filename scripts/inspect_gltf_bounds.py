import struct
import json

path = r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\public\models\ezrab-mascot.glb"

with open(path, "rb") as f:
    f.read(12)
    chunk_len, chunk_type = struct.unpack("<I4s", f.read(8))
    json_data = json.loads(f.read(chunk_len).decode('utf-8'))
    
    pos_acc_idx = json_data['meshes'][0]['primitives'][0]['attributes']['POSITION']
    pos_acc = json_data['accessors'][pos_acc_idx]
    print("POSITION accessor min:", pos_acc.get('min'))
    print("POSITION accessor max:", pos_acc.get('max'))
