"""Builds the blackjack table in Blender and renders it with Cycles.

blender -b -P scene.py -- table <out> <frames: all|i,j,k> <samples>
blender -b -P scene.py -- chips <out> <samples>

Run texgen.py first for the textures, and package.py after to put the art in the apps.

Blender is z-up; the table's straight dealer edge runs along y = 0 and the players sit at y < 0.
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "tex")
L = json.load(open(os.path.join(HERE, "layout.json")))
args = sys.argv[sys.argv.index("--") + 1 :]
MODE, OUT = args[0], os.path.abspath(args[1])
os.makedirs(OUT, exist_ok=True)

FRAMES, HIGH, LOW = 31, 80, 24
ELEVATIONS = [HIGH - (HIGH - LOW) * i / (FRAMES - 1) for i in range(FRAMES)]
CHIP_LEVELS = list(range(24, 85, 6))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.use_denoising = True
scene.cycles.denoiser = "OPENIMAGEDENOISE"
scene.render.film_transparent = True
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Punchy"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"

# ---- Helpers ------------------------------------------------------------------------------------------


def material(name, build):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    build(nt, bsdf)
    return m


def image(name, colorspace="sRGB"):
    img = bpy.data.images.load(os.path.join(TEX, name), check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def tex_node(nt, name, colorspace="sRGB"):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = image(name, colorspace)
    n.interpolation = "Cubic"
    return n


def link(nt, a, b):
    nt.links.new(a, b)


def bump(nt, height, strength, distance=0.002):
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = strength
    b.inputs["Distance"].default_value = distance
    link(nt, height, b.inputs["Height"])
    return b.outputs["Normal"]


def mesh_object(name, bm, mat=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def arc_curve(name, radius, z, bevel, scale_z, mat, a0=0.0, a1=math.pi):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = bevel
    cu.bevel_resolution = 10
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    n = 240
    sp.points.add(n)
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        sp.points[i].co = (radius * math.cos(a), -radius * math.sin(a), z, 1)
    ob = bpy.data.objects.new(name, cu)
    ob.scale.z = scale_z
    scene.collection.objects.link(ob)
    cu.materials.append(mat)
    return ob


# ---- Materials ------------------------------------------------------------------------------------------


def felt_mat(nt, bsdf):
    uv = nt.nodes.new("ShaderNodeTexCoord")
    col = tex_node(nt, "felt.png")
    ink = tex_node(nt, "ink.png", "Non-Color")
    link(nt, uv.outputs["UV"], col.inputs["Vector"])
    link(nt, uv.outputs["UV"], ink.inputs["Vector"])
    link(nt, col.outputs["Color"], bsdf.inputs["Base Color"])
    # Nap: fine fibre noise in object space, plus a slow unevenness.
    fibre = nt.nodes.new("ShaderNodeTexNoise")
    fibre.inputs["Scale"].default_value = 1400
    fibre.inputs["Detail"].default_value = 4
    fibre.inputs["Roughness"].default_value = 0.7
    link(nt, uv.outputs["Object"], fibre.inputs["Vector"])
    bsdf.inputs["Roughness"].default_value = 0.92
    bsdf.inputs["Sheen Weight"].default_value = 0.9
    bsdf.inputs["Sheen Roughness"].default_value = 0.35
    bsdf.inputs["Sheen Tint"].default_value = (0.55, 0.85, 0.65, 1)
    # Ink sits on the nap: a touch smoother and less fuzzy.
    rough = nt.nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.92
    rough.inputs["To Max"].default_value = 0.6
    link(nt, ink.outputs["Color"], rough.inputs["Value"])
    link(nt, rough.outputs["Result"], bsdf.inputs["Roughness"])
    link(nt, bump(nt, fibre.outputs["Fac"], 0.22, 0.0015), bsdf.inputs["Normal"])


def leather_mat(nt, bsdf):
    co = nt.nodes.new("ShaderNodeTexCoord")
    v = nt.nodes.new("ShaderNodeTexVoronoi")
    v.inputs["Scale"].default_value = 420
    link(nt, co.outputs["Object"], v.inputs["Vector"])
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 12
    link(nt, co.outputs["Object"], n.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.016, 0.006, 0.004, 1)
    ramp.color_ramp.elements[1].color = (0.03, 0.012, 0.007, 1)
    link(nt, n.outputs["Fac"], ramp.inputs["Fac"])
    link(nt, ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.5
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    bsdf.inputs["Coat Weight"].default_value = 0.12
    bsdf.inputs["Coat Roughness"].default_value = 0.35
    bsdf.inputs["Sheen Weight"].default_value = 0.15
    link(nt, bump(nt, v.outputs["Distance"], 0.25, 0.001), bsdf.inputs["Normal"])


def wood_mat(rings):
    def build(nt, bsdf):
        co = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        # Rings round the table's centre follow the armrest's curve; bands run along the straight edge.
        mp.inputs["Scale"].default_value = (1, 1, 0.0) if rings else (0.0, 1, 1)
        link(nt, co.outputs["Object"], mp.inputs["Vector"])
        w = nt.nodes.new("ShaderNodeTexWave")
        w.wave_type = "RINGS" if rings else "BANDS"
        w.bands_direction = "Y" if not rings else "X"
        w.inputs["Scale"].default_value = 70
        w.inputs["Distortion"].default_value = 1.6
        w.inputs["Detail"].default_value = 4
        w.inputs["Detail Roughness"].default_value = 0.6
        link(nt, mp.outputs["Vector"], w.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.05, 0.018, 0.007, 1)
        ramp.color_ramp.elements[1].color = (0.13, 0.05, 0.02, 1)
        link(nt, w.outputs["Fac"], ramp.inputs["Fac"])
        link(nt, ramp.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.38
        bsdf.inputs["Coat Weight"].default_value = 0.6
        bsdf.inputs["Coat Roughness"].default_value = 0.12
        link(nt, bump(nt, w.outputs["Fac"], 0.06, 0.0008), bsdf.inputs["Normal"])

    return build


def plain(color, rough, metal=0.0, coat=0.0):
    def build(nt, bsdf):
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Coat Weight"].default_value = coat

    return build


def chip_side_mat(name):
    def build(nt, bsdf):
        t = tex_node(nt, name)
        link(nt, t.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.55
        bsdf.inputs["Specular IOR Level"].default_value = 0.35
        bsdf.inputs["Coat Weight"].default_value = 0.08
        bsdf.inputs["Coat Roughness"].default_value = 0.5

    return build


def chip_face_mat(i):
    def build(nt, bsdf):
        t = tex_node(nt, f"chip-face-{i}.png")
        b = tex_node(nt, f"chip-bump-{i}.png", "Non-Color")
        link(nt, t.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.58
        bsdf.inputs["Specular IOR Level"].default_value = 0.3
        bsdf.inputs["Coat Weight"].default_value = 0.08
        bsdf.inputs["Coat Roughness"].default_value = 0.5
        link(nt, bump(nt, b.outputs["Color"], 0.5, 0.004), bsdf.inputs["Normal"])

    return build


# ---- Table ----------------------------------------------------------------------------------------------
R = 1.0


def half_disc(radius, segments=256):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new()
    centre = bm.verts.new((0, 0, 0))
    rim = [bm.verts.new((radius * math.cos(math.pi * i / segments), -radius * math.sin(math.pi * i / segments), 0)) for i in range(segments + 1)]
    for a, b in zip(rim, rim[1:]):
        f = bm.faces.new((centre, b, a))
        for loop in f.loops:
            x, y, _ = loop.vert.co
            loop[uv_layer].uv = ((x / R + 1) / 2, y / R + 1)
    return bm


def build_table():
    felt = mesh_object("Felt", half_disc(R), material("Felt", felt_mat))
    felt.location.z = 0.0
    body = mesh_object("Body", half_disc(R * 1.04, 128), material("Body", plain((0.01, 0.008, 0.007, 1), 0.7)))
    solid = body.modifiers.new("solid", "SOLIDIFY")
    solid.thickness = 0.09
    solid.offset = -1
    body.location.z = -0.002

    leather = material("Leather", leather_mat)
    rail = arc_curve("Rail", R + 0.05, 0.04 / 0.82, 0.066, 0.82, leather)
    wood = material("Wood", wood_mat(True))
    arc_curve("Armrest", R + 0.112, -0.03 / 0.7, 0.034, 0.7, wood)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.036, 0.012))
    edge = bpy.context.object
    edge.name = "DealerEdge"
    edge.scale = (2 * (R + 0.116), 0.075, 0.07)
    edge.data.materials.append(material("EdgeWood", wood_mat(False)))
    bev = edge.modifiers.new("bevel", "BEVEL")
    bev.width = 0.012
    bev.segments = 4

    # The dealer's tray: smoked metal, dividers, tubes of chips lying in it.
    metal = material("Tray", plain((0.03, 0.028, 0.026, 1), 0.3, 0.9))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.075, 0.013))
    tray = bpy.context.object
    tray.name = "Tray"
    tray.scale = (0.66, 0.13, 0.026)
    tray.data.materials.append(metal)
    tray.modifiers.new("bevel", "BEVEL").width = 0.004
    rack = [4, 5, 1, 5, 2, 5, 3, 8]
    for i, ci in enumerate(rack):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.034, depth=0.11, location=(-0.28 + i * 0.08, -0.075, 0.05), rotation=(math.pi / 2, 0, 0))
        tube = bpy.context.object
        tube.name = f"Tube{i}"
        tube.data.materials.append(material(f"Tube{i}", chip_side_mat(f"tube-{ci}.png")))
        smooth(tube)
    for i in range(len(rack) + 1):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.32 + i * 0.08, -0.075, 0.035))
        d = bpy.context.object
        d.scale = (0.006, 0.13, 0.03)
        d.data.materials.append(metal)

    for ob in (rail, scene.objects["Armrest"]):
        ob.pass_index = 1


def floor():
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.093))
    f = bpy.context.object
    f.name = "Floor"
    f.is_shadow_catcher = True


def lights():
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.join(bpy.utils.resource_path("LOCAL"), "datafiles", "studiolights", "world", "interior.exr"))
    link(nt, env.outputs["Color"], nt.nodes["Background"].inputs["Color"])
    nt.nodes["Background"].inputs["Strength"].default_value = 0.18
    # A warm pendant over the table, and a cool rim from behind the dealer.
    bpy.ops.object.light_add(type="AREA", location=(0.1, -0.7, 1.75))
    key = bpy.context.object
    key.data.shape = "DISK"
    key.data.size = 0.7
    key.data.energy = 165
    key.data.color = (1.0, 0.86, 0.7)
    key.rotation_euler = (Vector((0, -0.45, 0)) - key.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.light_add(type="AREA", location=(-1.4, 2.4, 2.0))
    rim = bpy.context.object
    rim.data.size = 2.0
    rim.data.energy = 90
    rim.data.color = (0.78, 0.85, 1.0)
    rim.rotation_euler = (Vector((0, -0.3, 0)) - rim.location).to_track_quat("-Z", "Y").to_euler()


def camera(elevation, distance, fov=26, target=(0, -0.42, 0)):
    cam = scene.camera
    if cam is None:
        bpy.ops.object.camera_add()
        cam = bpy.context.object
        scene.camera = cam
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(fov)
    e = math.radians(elevation)
    t = Vector(target)
    cam.location = (t.x, t.y - distance * math.cos(e), t.z + distance * math.sin(e))
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    return cam


def project(cam, p):
    v = world_to_camera_view(scene, cam, Vector(p))
    return v.x, 1 - v.y


def rail_mask_output():
    """Writes the rail and armrest, anti-aliased and on their own, beside each frame."""
    scene.view_layers[0].use_pass_object_index = True
    scene.use_nodes = True
    nt = scene.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    rl = nt.nodes.new("CompositorNodeRLayers")
    comp = nt.nodes.new("CompositorNodeComposite")
    link(nt, rl.outputs["Image"], comp.inputs["Image"])
    idm = nt.nodes.new("CompositorNodeIDMask")
    idm.index = 1
    idm.use_antialiasing = True
    link(nt, rl.outputs["IndexOB"], idm.inputs["ID value"])
    sa = nt.nodes.new("CompositorNodeSetAlpha")
    sa.mode = "APPLY"
    link(nt, rl.outputs["Image"], sa.inputs["Image"])
    link(nt, idm.outputs["Alpha"], sa.inputs["Alpha"])
    fo = nt.nodes.new("CompositorNodeOutputFile")
    fo.base_path = OUT
    fo.format.file_format = "PNG"
    fo.format.color_mode = "RGBA"
    fo.file_slots[0].path = "rail-"
    link(nt, sa.outputs["Image"], fo.inputs[0])


# ---- Modes ----------------------------------------------------------------------------------------------
if MODE == "table":
    which, samples = args[2], int(args[3])
    build_table()
    floor()
    lights()
    rail_mask_output()
    scene.cycles.samples = samples
    scene.render.resolution_x, scene.render.resolution_y = 1300, 1080
    frames = range(FRAMES) if which == "all" else [int(x) for x in which.split(",")]
    meta_path = os.path.join(OUT, "meta.json")
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {"elevations": ELEVATIONS, "anchors": {}}
    for i in frames:
        el = ELEVATIONS[i]
        k = (HIGH - el) / (HIGH - LOW)
        cam = camera(el, 4.45 - 0.15 * k)
        anchors = []
        for a in L["angles"]:
            a = math.radians(a)
            out = {}
            for key, ring, radius in (("", L["seatRing"], L["markerR"]), ("b", L["spotRing"], L["stackR"])):
                p = Vector((ring * math.cos(a), -ring * math.sin(a), 0.0))
                x, y = project(cam, p)
                lx, _ = project(cam, p + Vector((-radius, 0, 0)))
                rx, _ = project(cam, p + Vector((radius, 0, 0)))
                to_cam = cam.location - p
                out[key + "x"], out[key + "y"], out[key + "r"] = x, y, abs(rx - lx) / 2
                # The angle this spot is actually seen from, so its chip is drawn from the same height.
                out[key + "e"] = math.degrees(math.asin(to_cam.z / to_cam.length))
            anchors.append({k2: round(v, 5) for k2, v in out.items()})
        meta["anchors"][str(i)] = anchors
        scene.frame_current = i
        scene.render.filepath = os.path.join(OUT, f"table-{i:02d}.png")
        bpy.ops.render.render(write_still=True)
        json.dump(meta, open(meta_path, "w"))
        print("frame", i, flush=True)

if MODE == "chips":
    samples = int(args[2])
    bpy.ops.mesh.primitive_plane_add(size=4, location=(0, -0.8, 0))
    bpy.context.object.is_shadow_catcher = True
    lights()
    scene.cycles.samples = samples
    S = 320
    scene.render.resolution_x = scene.render.resolution_y = S
    r, t = L["markerR"], L["markerR"] * L["chipThickness"]
    cam = camera(50, 3, target=(0, -0.8, t / 2))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2 * r * 1.45
    meta = {"levels": CHIP_LEVELS, "thickness": L["chipThickness"], "chips": {}}
    for ci in range(1, len(L["chips"]) + 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=r, depth=t, location=(0, -0.8, t / 2))
        chip = bpy.context.object
        chip.name = f"Chip{ci}"
        chip.data.materials.append(material(f"Side{ci}", chip_side_mat(f"chip-side-{ci}.png")))
        chip.data.materials.append(material(f"Face{ci}", chip_face_mat(ci)))
        uv = chip.data.uv_layers.active.data
        for p in chip.data.polygons:
            cap = abs(p.normal.z) > 0.9
            p.material_index = 1 if cap else 0
            if cap:
                # The whole face artwork across the cap (the primitive packs caps into a corner).
                for li in p.loop_indices:
                    x, y, _ = chip.data.vertices[chip.data.loops[li].vertex_index].co
                    uv[li].uv = (x / r * 0.5 + 0.5, y / r * 0.5 + 0.5)
        bev = chip.modifiers.new("bevel", "BEVEL")
        bev.width = r * 0.035
        bev.segments = 6
        bev.harden_normals = False
        smooth(chip)
        for level in CHIP_LEVELS:
            cam = camera(level, 3, target=(0, -0.8, t / 2))
            base = project(cam, (0, -0.8, 0))
            top = project(cam, (0, -0.8, t))
            left = project(cam, (-r, -0.8, 0))
            right = project(cam, (r, -0.8, 0))
            meta["chips"][str(level)] = {"base": base, "top": top, "diameter": right[0] - left[0], "size": S}
            scene.render.filepath = os.path.join(OUT, f"chip-{level}-{ci}.png")
            bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(chip)
        print("chip", ci, flush=True)
    json.dump(meta, open(os.path.join(OUT, "chips.json"), "w"))
