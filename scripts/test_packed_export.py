import bpy
import os

print("=== PACKING & SCALING IMAGES ===")
for img in bpy.data.images:
    if img.users > 0:
        if not img.packed_file:
            try:
                img.pack()
                print(f"Packed image {img.name}")
            except Exception as e:
                print(f"Failed to pack {img.name}: {e}")
        if img.size[0] > 1024 or img.size[1] > 1024:
            print(f"Scaling {img.name} from {img.size[0]}x{img.size[1]} to 1024x1024")
            img.scale(1024, 1024)

output_glb = r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\public\models\ezrab-mascot.glb"

bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_image_format='JPEG',
    export_image_quality=85
)

size_mb = os.path.getsize(output_glb) / (1024 * 1024)
print(f"=== RESULTING GLB SIZE: {size_mb:.2f} MB ===")
