import bpy
import sys

print("=== BLENDER INSPECTION ===")
for obj in bpy.data.objects:
    print(f"Object: {obj.name}, type: {obj.type}, mesh: {obj.data.name if obj.type == 'MESH' else 'N/A'}")
    if obj.type == 'MESH':
        print(f"  verts: {len(obj.data.vertices)}, faces: {len(obj.data.polygons)}")
        for mat_slot in obj.material_slots:
            if mat_slot.material:
                print(f"  material: {mat_slot.material.name}")

print("=== EXPORTING GLB ===")
output_glb = r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\public\models\ezrab-mascot.glb"

# Make sure public/models exists
import os
os.makedirs(os.path.dirname(output_glb), exist_ok=True)

# Select all mesh objects
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)

# Export to GLB
bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True
)

file_size = os.path.getsize(output_glb) / (1024 * 1024)
print(f"=== EXPORT SUCCESS: {output_glb} ({file_size:.2f} MB) ===")
