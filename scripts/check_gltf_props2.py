import bpy

for k in bpy.ops.export_scene.gltf.get_rna_type().properties.keys():
    if 'image' in k.lower() or 'texture' in k.lower() or 'draco' in k.lower() or 'format' in k.lower() or 'compress' in k.lower():
        print(f"Prop: {k}")
