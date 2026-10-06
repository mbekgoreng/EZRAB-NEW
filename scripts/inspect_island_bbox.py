import bpy
import bmesh
import mathutils

obj = bpy.data.objects.get("input_mesh")
me = obj.data

bm = bmesh.new()
bm.from_mesh(me)

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
    xs = [v.co.x for f in isl for v in f.verts]
    ys = [v.co.y for f in isl for v in f.verts]
    zs = [v.co.z for f in isl for v in f.verts]
    print(f"Island {idx} (faces: {len(isl)}):")
    print(f"  X: [{min(xs):.3f}, {max(xs):.3f}], Y: [{min(ys):.3f}, {max(ys):.3f}], Z: [{min(zs):.3f}, {max(zs):.3f}]")

bm.free()
