import bpy

mesh = bpy.data.meshes["input_mesh"]
print(f"Vertices: {len(mesh.vertices)}")
print(f"Polygons: {len(mesh.polygons)}")
print(f"Loops: {len(mesh.loops)}")
print(f"Shape keys: {mesh.shape_keys}")
print(f"Custom data layers: {len(mesh.attributes)}")
for attr in mesh.attributes:
    print(f"  Attribute: {attr.name}, type: {attr.data_type}, domain: {attr.domain}")

# Let's test exporting mesh WITHOUT materials:
bpy.ops.export_scene.gltf(
    filepath=r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\scripts\test_no_mat.glb",
    export_format='GLB',
    use_selection=True,
    export_materials='NONE'
)
import os
print("Size without materials:", os.path.getsize(r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\scripts\test_no_mat.glb"), "bytes")
