import bpy

obj = bpy.data.objects.get("input_mesh")
print("Material slots:", len(obj.material_slots))
for idx, slot in enumerate(obj.material_slots):
    print(f"  Slot {idx}: {slot.material.name if slot.material else 'None'}")

# Check vertex groups
print("Vertex groups:", len(obj.vertex_groups))
for vg in obj.vertex_groups:
    print(f"  VG: {vg.name}")

# Check dimensions and bounding box
print(f"Dimensions: x={obj.dimensions.x:.3f}, y={obj.dimensions.y:.3f}, z={obj.dimensions.z:.3f}")
bb = [list(c) for c in obj.bound_box]
print("Bound box:", bb)
