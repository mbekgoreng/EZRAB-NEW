import struct
import json

path = r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\public\models\ezrab-mascot.glb"

with open(path, "rb") as f:
    magic, version, length = struct.unpack("<4sII", f.read(12))
    print(f"Header: magic={magic}, version={version}, total_length={length}")
    
    chunk_len, chunk_type = struct.unpack("<I4s", f.read(8))
    print(f"Chunk 0: type={chunk_type}, len={chunk_len}")
    json_data = json.loads(f.read(chunk_len).decode('utf-8'))
    
    print("GLTF summary:")
    print(f"  meshes: {len(json_data.get('meshes', []))}")
    print(f"  materials: {len(json_data.get('materials', []))}")
    print(f"  textures: {len(json_data.get('textures', []))}")
    print(f"  images: {len(json_data.get('images', []))}")
    for idx, img in enumerate(json_data.get('images', [])):
        bv_idx = img.get('bufferView')
        mime = img.get('mimeType')
        print(f"  Image {idx}: name={img.get('name')}, mimeType={mime}, bufferView={bv_idx}")
    
    print(f"  bufferViews: {len(json_data.get('bufferViews', []))}")
    for idx, bv in enumerate(json_data.get('bufferViews', [])):
        print(f"    BufferView {idx}: byteLength={bv.get('byteLength')} ({bv.get('byteLength')/(1024*1024):.2f} MB), byteOffset={bv.get('byteOffset')}")
