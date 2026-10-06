import bpy

print("=== IMAGES IN BLEND ===")
for img in bpy.data.images:
    print(f"Image: {img.name}, size: {img.size[0]}x{img.size[1]}, file_format: {img.file_format}, packed: {img.packed_file is not None}, filepath: {img.filepath}")
    if img.packed_file:
        print(f"  packed size: {img.packed_file.size / (1024*1024):.2f} MB")

print("=== MESHES IN BLEND ===")
for m in bpy.data.meshes:
    print(f"Mesh: {m.name}, verts: {len(m.vertices)}, faces: {len(m.polygons)}")
    for uv in m.uv_layers:
        print(f"  uv layer: {uv.name}")
    for col in m.color_attributes:
        print(f"  color attribute: {col.name}")
