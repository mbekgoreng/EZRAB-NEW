import bpy
import math
import os

obj = bpy.data.objects.get("input_mesh")

# Ensure subsurf level 2
subsurf = obj.modifiers.get("Subdivision")
if subsurf:
    subsurf.levels = 2
    subsurf.render_levels = 2

# Resize textures to 1536
for img in bpy.data.images:
    if img.users > 0:
        if not img.packed_file:
            try:
                img.pack()
            except:
                pass
        if img.size[0] > 1536 or img.size[1] > 1536:
            img.scale(1536, 1536)

# Rotate 90 degrees around X so Y in Blender is pointing Up when stood up
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj

# Check current rotation
obj.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

output_glb = r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\public\models\ezrab-mascot.glb"

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
print(f"Exported upright GLB: {size_mb:.2f} MB")
