import bpy

prop = bpy.ops.export_scene.gltf.get_rna_type().properties['export_image_format']
print("export_image_format enum items:", [item.identifier for item in prop.enum_items])

prop_webp = bpy.ops.export_scene.gltf.get_rna_type().properties.get('export_image_add_webp')
print("export_image_add_webp:", prop_webp)
