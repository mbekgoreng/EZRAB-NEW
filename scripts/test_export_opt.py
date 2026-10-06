import bpy
import os

# Let's inspect export_format / compression / texture resizing
# In Blender, images can be scaled: img.scale(width, height)
# Let's see original image sizes: 4096 -> 2048 (still ultra-HD 2K)
for img in bpy.data.images:
    if img.size[0] > 2048 or img.size[1] > 2048:
        print(f"Resizing {img.name} from {img.size[0]}x{img.size[1]} to 2048x2048")
        img.scale(2048, 2048)

# Clean unused duplicate images if any
for img in list(bpy.data.images):
    if img.users == 0:
        bpy.data.images.remove(img)

output_glb = r"d:\file kerja\PEMBUATAN SOFTWARE\ezrab site web\public\models\ezrab-mascot.glb"

# Select mesh
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
print(f"Optimized GLB size with 2K JPEG: {size_mb:.2f} MB")
