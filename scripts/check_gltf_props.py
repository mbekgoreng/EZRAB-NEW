import bpy

# Let's inspect export_scene.gltf parameters in Blender
import inspect
from io_scene_gltf2 import export_gltf
print("gltf exporter module loaded")

# In Blender 5.2, what are the parameters for images?
# Let's check bpy.ops.export_scene.gltf doc
print(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
