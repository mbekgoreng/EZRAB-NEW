import bpy

obj = bpy.data.objects.get("input_mesh")
print("=== MODIFIERS ON input_mesh ===")
for mod in obj.modifiers:
    print(f"Modifier: {mod.name}, type: {mod.type}")
    if mod.type == 'SUBSURF':
        print(f"  levels: {mod.levels}, render_levels: {mod.render_levels}")
