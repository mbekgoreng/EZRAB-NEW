import bpy
import bmesh

obj = bpy.data.objects.get("input_mesh")
me = obj.data

bm = bmesh.new()
bm.from_mesh(me)
uv_layer = bm.loops.layers.uv.verify()

visited_faces = set()
islands = []

for face in bm.faces:
    if face in visited_faces:
        continue
    island = []
    queue = [face]
    visited_faces.add(face)
    while queue:
        f = queue.pop()
        island.append(f)
        for edge in f.edges:
            for linked_face in edge.link_faces:
                if linked_face not in visited_faces:
                    visited_faces.add(linked_face)
                    queue.append(linked_face)
    islands.append(island)

for idx, isl in enumerate(islands):
    uvs = [loop[uv_layer].uv for f in isl for loop in f.loops]
    u_min, u_max = min(p.x for p in uvs), max(p.x for p in uvs)
    v_min, v_max = min(p.y for p in uvs), max(p.y for p in uvs)
    print(f"Island {idx}: faces={len(isl)}, UV U=[{u_min:.3f}, {u_max:.3f}], V=[{v_min:.3f}, {v_max:.3f}]")

bm.free()
