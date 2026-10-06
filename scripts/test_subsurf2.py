import bpy
import os

obj = bpy.data.objects.get("input_mesh")
subsurf = obj.modifiers.get("Subdivision")
if subsurf:
    subsurf.levels = 2
    subsurf.render_levels = 2

for img in bpy.data.images:
    if img.users > 0:
        if not img.packed_file:
            try:
                img.pack()
            except:
                pass
        if img.size[0] > 2048 or img.size[1] > 2048:
            img.scale(2048, 2048)

output_glb = r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\public\models\ezrab-mascot.glb"

bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_image_format='JPEG',
    export_image_quality=90
)

size_mb = os.path.getsize(output_glb) / (1024 * 1024)
print(f"=== SUBDIVISION LEVEL 2 GLB SIZE (2K textures): {size_mb:.2f} MB ({os.path.getsize(output_glb)/1024:.1f} KB) ===")
