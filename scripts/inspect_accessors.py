import struct
import json

path = r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\public\models\ezrab-mascot.glb"

with open(path, "rb") as f:
    f.read(12)
    chunk_len, chunk_type = struct.unpack("<I4s", f.read(8))
    json_data = json.loads(f.read(chunk_len).decode('utf-8'))
    
    print("=== ACCESSORS ===")
    for idx, acc in enumerate(json_data.get('accessors', [])):
        print(f"Accessor {idx}: type={acc.get('type')}, componentType={acc.get('componentType')}, count={acc.get('count')}, bufferView={acc.get('bufferView')}")
    
    print("=== MESH PRIMITIVES ===")
    for mesh in json_data.get('meshes', []):
        for prim in mesh.get('primitives', []):
            print("  attributes:", prim.get('attributes'))
            print("  indices:", prim.get('indices'))
