import bpy
import os

obj = bpy.data.objects.get("input_mesh")

# Ensure subsurf level 2 for silky smooth curved surface
subsurf = obj.modifiers.get("Subdivision")
if subsurf:
    subsurf.levels = 2
    subsurf.render_levels = 2

# Resize textures to 1536x1536 with high quality
for img in bpy.data.images:
    if img.users > 0:
        if not img.packed_file:
            try:
                img.pack()
            except:
                pass
        if img.size[0] > 1536 or img.size[1] > 1536:
            print(f"Scaling {img.name} to 1536x1536")
            img.scale(1536, 1536)

# Ensure smooth shading on the mesh
me = obj.data
for poly in me.polygons:
    poly.use_smooth = True

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
    export_image_quality=85
)

size_mb = os.path.getsize(output_glb) / (1024 * 1024)
print(f"=== FLAGSHIP GLB EXPORTED: {output_glb} ({size_mb:.2f} MB / {os.path.getsize(output_glb)/1024:.1f} KB) ===")
