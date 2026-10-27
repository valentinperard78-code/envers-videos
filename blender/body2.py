"""Voyage réaliste à l'intérieur du corps (style animation médicale) — La Villa des Pathologies.
Voyage complet : intestin, vaisseau, pancréas, insuline, cellule (ouverte puis bloquée).
Usage : blender -b -P body.py -- <dossier_sortie> <images...>   (sans argument : animation complète)"""
import bpy, bmesh, math, os, sys, random
from mathutils import Vector, Matrix, Euler

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.join(os.path.dirname(os.path.abspath(__file__)), "rendu_corps")
FRAMES = [int(x) for x in argv[1:]]
RES = (int(os.environ.get("RES_X", 720)), int(os.environ.get("RES_Y", 1280)))
SAMPLES = int(os.environ.get("SAMPLES", 48))
FPS = 24
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = kind; prefs.get_devices()
            if [d for d in prefs.devices if d.type == kind]:
                for d in prefs.devices: d.use = True
                sc.cycles.device = "GPU"; print("GPU", kind); break
        except Exception: pass
except Exception: pass
sc.cycles.samples = SAMPLES
sc.cycles.use_adaptive_sampling = True
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 6
sc.cycles.transparent_max_bounces = 8
sc.render.resolution_x, sc.render.resolution_y = RES
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 1, 856
sc.view_settings.view_transform = "AgX"
try: sc.view_settings.look = "AgX - Medium High Contrast"
except Exception: pass
sc.render.use_persistent_data = True

world = bpy.data.worlds.new("W"); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.02, 0.003, 0.004, 1); bg.inputs[1].default_value = 1.0
world.mist_settings.start, world.mist_settings.depth, world.mist_settings.falloff = 0.5, 14, "QUADRATIC"
sc.view_layers[0].use_pass_mist = True

# ---------- matériaux ----------
def mat(name, base, rough=0.35, sss=0.0, sss_rad=(1, .3, .2), sss_scale=.1, coat=0.0, emit=None, emit_s=0.0, alpha=1.0, trans=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Subsurface Weight"].default_value = sss; b.inputs["Subsurface Radius"].default_value = sss_rad
    b.inputs["Subsurface Scale"].default_value = sss_scale; b.inputs["Coat Weight"].default_value = coat
    if emit: b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = emit_s
    if alpha < 1: b.inputs["Alpha"].default_value = alpha
    if trans: b.inputs["Transmission Weight"].default_value = trans
    return m

def organic(name, c1, c2, vein, bump_scale=40, bump_str=0.5, sss=0.6, rough=0.28, coat=0.6, voro=True):
    """Tissu humide : couleur bruitée + veinules + bosses (villosités)."""
    m = mat(name, c1, rough, sss, (1, .25, .2), .15, coat)
    nt = m.node_tree; N = nt.nodes; L = nt.links; b = N["Principled BSDF"]
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 3; nz.inputs["Detail"].default_value = 8
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs[6].default_value = (*c1, 1); mix.inputs[7].default_value = (*c2, 1)
    L.new(nz.outputs["Fac"], mix.inputs[0])
    # veinules
    vn = N.new("ShaderNodeTexNoise"); vn.inputs["Scale"].default_value = 2.2; vn.inputs["Detail"].default_value = 6; vn.inputs["Roughness"].default_value = .6
    L.new(tc.outputs["Object"], vn.inputs["Vector"])
    ramp = N.new("ShaderNodeValToRGB"); el = ramp.color_ramp.elements
    el[0].position, el[1].position = .47, .5; el[0].color = (1, 1, 1, 1); el[1].color = (0, 0, 0, 1)
    e2 = el.new(.53); e2.color = (1, 1, 1, 1)
    L.new(vn.outputs["Fac"], ramp.inputs["Fac"])
    inv = N.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1
    L.new(ramp.outputs["Color"], inv.inputs[1])
    mix2 = N.new("ShaderNodeMix"); mix2.data_type = "RGBA"; mix2.inputs[7].default_value = (*vein, 1)
    L.new(inv.outputs[0], mix2.inputs[0]); L.new(mix.outputs[2], mix2.inputs[6])
    L.new(mix2.outputs[2], b.inputs["Base Color"])
    try: L.new(mix2.outputs[2], b.inputs["Subsurface Radius"])
    except Exception: pass
    # relief
    bump = N.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = bump_str; bump.inputs["Distance"].default_value = .05
    if voro:
        vo = N.new("ShaderNodeTexVoronoi"); vo.inputs["Scale"].default_value = bump_scale
        L.new(tc.outputs["Object"], vo.inputs["Vector"])
        sm = N.new("ShaderNodeMath"); sm.operation = "SUBTRACT"; sm.inputs[0].default_value = 1
        L.new(vo.outputs["Distance"], sm.inputs[1])
        add = N.new("ShaderNodeMath"); add.operation = "ADD"
        L.new(sm.outputs[0], add.inputs[0]); L.new(nz.outputs["Fac"], add.inputs[1])
        L.new(add.outputs[0], bump.inputs["Height"])
    else:
        L.new(nz.outputs["Fac"], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

def glow(name, col, s):
    m = bpy.data.materials.new(name); m.use_nodes = True
    N = m.node_tree.nodes; L = m.node_tree.links
    N.remove(N["Principled BSDF"]); e = N.new("ShaderNodeEmission")
    e.inputs[0].default_value = (*col, 1); e.inputs[1].default_value = s
    L.new(e.outputs[0], N["Material Output"].inputs[0]); return m

M_INT = organic("intestin", (0.85, 0.30, 0.36), (1.0, 0.55, 0.52), (0.72, 0.22, 0.30), bump_scale=45, bump_str=.6)
M_VES = organic("vaisseau", (0.75, 0.12, 0.16), (0.95, 0.38, 0.38), (0.62, 0.08, 0.14), bump_scale=12, bump_str=.2, voro=False, coat=.2)
M_RBC = mat("globule", (0.55, 0.02, 0.04), .32, .7, (1, .15, .1), .08, coat=.4)
M_FOOD = mat("nourriture", (0.85, 0.62, 0.30), .5, .5, (1, .8, .5), .1)
M_GLU = glow("glucose", (0.75, 0.92, 1.0), 6.0)
M_BOND = glow("liaison", (0.5, 0.8, 1.0), 2.5)
M_MEM = organic("membrane", (0.55, 0.28, 0.75), (0.78, 0.52, 0.92), (0.50, 0.25, 0.70), bump_scale=70, bump_str=.35, sss=.7, coat=.5)
M_REC = mat("recepteur", (0.10, 0.55, 0.60), .3, .5, (.3, 1, 1), .05, coat=.5)
M_INS = mat("insuline", (0.95, 0.65, 0.12), .25, .3, (1, .7, .2), .05, coat=.7, emit=(1, .6, .1), emit_s=.6)
M_PORE = glow("canal", (0.4, 1.0, 0.7), 3.0)
M_CELLBG = mat("cellules_fond", (0.55, 0.25, 0.70), .4, .6, (1, .4, 1), .3)
M_PANC = organic("pancreas", (0.95, 0.55, 0.42), (1.0, 0.75, 0.6), (0.85, 0.45, 0.35), bump_scale=30, bump_str=.4)
M_ILOT = mat("ilot", (1.0, 0.85, 0.4), .3, .4, (1, .8, .3), .1, emit=(1, .75, .2), emit_s=1.5)
M_RUST = mat("recepteur_grippe", (0.45, 0.22, 0.08), .7, .2, (1, .5, .2), .05)
M_STOP = glow("canal_ferme", (1.0, 0.15, 0.1), 3.0)
M_NOODLE = mat("pates", (0.98, 0.78, 0.38), .45, .5, (1, .8, .5), .1)

# ---------- outils ----------
def tube(name, path, n_rings, radius_fn, segs=72, inward=True, offset=Vector()):
    """Tube organique autour d'une ligne centrale path(s) (s dans [0,1])."""
    bm = bmesh.new(); rings = []
    for i in range(n_rings):
        s = i / (n_rings - 1)
        c = path(s); nxt = path(min(1, s + 1e-3)) - path(max(0, s - 1e-3)); nxt.normalize()
        up = Vector((0, 0, 1)) if abs(nxt.z) < .9 else Vector((1, 0, 0))
        u = nxt.cross(up).normalized(); v = nxt.cross(u).normalized()
        ring = []
        for j in range(segs):
            a = 2 * math.pi * j / segs
            r = radius_fn(s, a)
            ring.append(bm.verts.new(c + offset + (u * math.cos(a) + v * math.sin(a)) * r))
        rings.append(ring)
    for i in range(n_rings - 1):
        for j in range(segs):
            a, b_, c_, d = rings[i][j], rings[i][(j + 1) % segs], rings[i + 1][(j + 1) % segs], rings[i + 1][j]
            bm.faces.new((a, d, c_, b_) if inward else (a, b_, c_, d))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    sub = ob.modifiers.new("sub", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
    return ob

def blob(name, loc, size, m, seed=0, rough=0.25):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=size, location=loc)
    ob = bpy.context.object; ob.name = name
    rnd = random.Random(seed)
    for v in ob.data.vertices:
        v.co *= 1 + (rnd.random() - .5) * rough
    sub = ob.modifiers.new("s", "SUBSURF"); sub.levels = sub.render_levels = 2
    bpy.ops.object.shade_smooth(); ob.data.materials.append(m); return ob

def rbc_mesh():
    """Globule rouge biconcave (forme d'Evans-Fung)."""
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=1)
    for v in bm.verts:
        x, y, z = v.co; r2 = min(1, x * x + y * y)
        h = 0.5 * math.sqrt(max(0, 1 - r2)) * (0.21 + 2.0 * r2 - 1.12 * r2 * r2)
        v.co.z = h if z >= 0 else -h
    me = bpy.data.meshes.new("rbc"); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(M_RBC); return me
RBC = rbc_mesh()

def glucose(loc, s=0.12, name="glc"):
    """Molécule de glucose : cycle à 6 atomes lumineux."""
    parent = bpy.data.objects.new(name, None); sc.collection.objects.link(parent); parent.location = loc
    pts = []
    for k in range(6):
        a = k * math.pi / 3
        pts.append(Vector((math.cos(a) * s, math.sin(a) * s, 0)))
    for k, p in enumerate(pts):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=s * .32, location=p, segments=16, ring_count=8)
        o = bpy.context.object; o.data.materials.append(M_GLU if k != 5 else M_BOND); o.parent = parent; bpy.ops.object.shade_smooth()
        q = pts[(k + 1) % 6]; mid = (p + q) / 2; d = q - p
        bpy.ops.mesh.primitive_cylinder_add(radius=s * .08, depth=d.length, location=mid, vertices=8)
        c = bpy.context.object; c.rotation_euler = d.to_track_quat("Z", "Y").to_euler(); c.data.materials.append(M_BOND); c.parent = parent
    for k in (0, 2, 4):  # groupes OH
        a = k * math.pi / 3; p = Vector((math.cos(a) * s * 1.7, math.sin(a) * s * 1.7, 0))
        bpy.ops.mesh.primitive_uv_sphere_add(radius=s * .22, location=p, segments=12, ring_count=6)
        o = bpy.context.object; o.data.materials.append(M_BOND); o.parent = parent
    return parent

def key(ob, path, f, v):
    setattr(ob, path, v); ob.keyframe_insert(path, frame=f)

def lin_keys(ob):
    if ob.animation_data and ob.animation_data.action:
        for fc in ob.animation_data.action.fcurves:
            for kp in fc.keyframe_points: kp.interpolation = "LINEAR"

def camera(name, lens=20, fstop=2.8):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.clip_start = .02; cd.clip_end = 200
    cd.dof.use_dof = True; cd.dof.aperture_fstop = fstop
    ob = bpy.data.objects.new(name, cd); sc.collection.objects.link(ob); return ob

def follow_light(cam, energy, col, dist=0.0, radius=.3):
    ld = bpy.data.lights.new(cam.name + "_lum", "POINT"); ld.energy = energy; ld.color = col; ld.shadow_soft_size = radius
    lo = bpy.data.objects.new(cam.name + "_lum", ld); sc.collection.objects.link(lo); lo.parent = cam; lo.location = (0, .25, -dist)
    return lo


def tube_out(name, path, n, radius, segs=16, m=None):
    ob = tube(name, path, n, lambda s, a: radius, segs, inward=False)
    if m: ob.data.materials.append(m)
    return ob

def scale_key(ob, f, s):
    ob.scale = (s, s, s); ob.keyframe_insert("scale", frame=f)

FR = {"A": (1, 182), "B": (183, 316), "P": (317, 431), "V": (432, 503), "C1": (504, 633), "C2": (634, 856)}

# =====================================================================
# A : INTESTIN — les pâtes se découpent en glucose
# =====================================================================
LA = 26.0
def pathA(s):
    z = s * LA
    return Vector((0.9 * math.sin(z * .22), 0.6 * math.sin(z * .17 + 1), -z))
def radA(s, a):
    z = s * LA
    fold = 0.22 * (0.5 + 0.5 * math.cos(z * 2.2)) ** 6
    return 1.7 * (1 - fold) + 0.08 * math.sin(a * 5 + z * 1.3) + 0.05 * math.sin(a * 11 - z)
intA = tube("intestin", pathA, 420, radA, 96); intA.data.materials.append(M_INT)
dA = intA.modifiers.new("relief", "DISPLACE"); tx = bpy.data.textures.new("nuages", "CLOUDS"); tx.noise_scale = .6
dA.texture = tx; dA.strength = .15; dA.texture_coords = "GLOBAL"
rnd = random.Random(3)
for k in range(9):
    s0 = .10 + k * .04
    base = pathA(s0); ang = rnd.random() * 6.28; off = Vector((math.cos(ang), math.sin(ang), 0)) * rnd.uniform(.35, .85)
    dirv = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-.6, .6))).normalized()
    pts = [base + off + dirv * (u - .5) * .9 + Vector((0, 0, math.sin(u * 6 + k) * .12)) for u in (0, .25, .5, .75, 1)]
    def pth(s, pts=pts):
        i = min(3, int(s * 4)); f = s * 4 - i
        return pts[i].lerp(pts[i + 1], f)
    nd = tube_out(f"pate{k}", pth, 24, .07, 12, M_NOODLE)
    fb = 30 + k * 14
    nd.location = Vector(); scale_key(nd, 1, 1); scale_key(nd, fb, 1)
    # mise à l'échelle autour de son centre : on parente à un vide
    piv = bpy.data.objects.new(f"piv{k}", None); sc.collection.objects.link(piv); piv.location = pts[2]
    nd.parent = piv; nd.location = -pts[2]
    nd.animation_data_clear(); scale_key(piv, 1, 1); scale_key(piv, fb, 1); scale_key(piv, fb + 18, 0.001)
    for j in range(5):
        p = pts[j] + Vector((rnd.uniform(-.1, .1), rnd.uniform(-.1, .1), rnd.uniform(-.1, .1)))
        g = glucose(p, .08, f"glcA{k}_{j}"); g.rotation_euler = (rnd.random() * 3, rnd.random() * 3, 0)
        scale_key(g, 1, 0.001); scale_key(g, fb + 4, 0.001); scale_key(g, fb + 16, 1)
        wall = pathA(s0) + (p - pathA(s0)).normalized() * 1.45
        key(g, "location", fb + 4, p); key(g, "location", 182, p.lerp(wall, .75))
        key(g, "rotation_euler", fb, g.rotation_euler.copy()); key(g, "rotation_euler", 182, Euler((g.rotation_euler.x + 2, 1, 0)))
camA = camera("camA", lens=18, fstop=2.8)
for f in range(1, 183, 6):
    s = .0 + (f - 1) / 182 * .30
    p = pathA(s); ahead = pathA(s + .05)
    camA.location = p + Vector((.15, .1, 0)); camA.rotation_euler = (ahead - p).to_track_quat("-Z", "Y").to_euler()
    camA.keyframe_insert("location", frame=f); camA.keyframe_insert("rotation_euler", frame=f)
camA.data.dof.focus_distance = 2.5
follow_light(camA, 30, (1, .9, .82))

# =====================================================================
# B : le glucose traverse la paroi et entre dans le sang
# =====================================================================
OB = Vector((200, 0, 0)); LB = 30.0
def pathB(s):
    z = s * LB
    return Vector((1.2 * math.sin(z * .12), .7 * math.sin(z * .09 + .5), -z))
def radB(s, a): return 1.3 + .04 * math.sin(a * 6 + s * 40)
vesB = tube("vaisseauB", pathB, 360, radB, 72, offset=OB); vesB.data.materials.append(M_VES)
def rbc_flow(origin, path, n, f0, f1, seed, span=.9, spread=.85):
    r = random.Random(seed)
    for k in range(n):
        s = r.random() * span
        c = origin + path(s) + Vector((r.uniform(-spread, spread), r.uniform(-spread, spread), 0))
        o = bpy.data.objects.new(f"rbc{seed}_{k}", RBC); sc.collection.objects.link(o)
        o.scale = (.32, .32, .32); o.rotation_euler = (r.random() * 3, r.random() * 3, r.random() * 3)
        key(o, "location", f0, c); key(o, "location", f1, c + Vector((0, 0, -r.uniform(2.5, 4.5))))
        key(o, "rotation_euler", f0, o.rotation_euler.copy()); key(o, "rotation_euler", f1, Euler((o.rotation_euler.x + 1.5, 0, 1)))
        lin_keys(o)
rbc_flow(OB, pathB, 70, 183, 316, 11)
rnd = random.Random(12)
for k in range(22):
    s = .06 + rnd.random() * .25
    c = OB + pathB(s); ang = rnd.random() * 6.28
    radial = Vector((math.cos(ang), math.sin(ang), 0))
    start, mid = c + radial * 1.9, c + radial * .6
    g = glucose(start, .08, f"glcB{k}"); fs = 190 + int(rnd.random() * 70)
    key(g, "location", 183, start); key(g, "location", fs, start); key(g, "location", fs + 30, mid)
    key(g, "location", 316, mid + Vector((0, 0, -1.5)))
    key(g, "rotation_euler", 183, Euler((k, 0, 0))); key(g, "rotation_euler", 316, Euler((k + 3, 2, 0)))
camB = camera("camB", lens=18, fstop=2.8)
for f in range(183, 317, 6):
    s = .0 + (f - 183) / 134 * .12
    p = OB + pathB(s); ahead = OB + pathB(s + .05)
    camB.location = p; camB.rotation_euler = (ahead - p).to_track_quat("-Z", "Y").to_euler()
    camB.keyframe_insert("location", frame=f); camB.keyframe_insert("rotation_euler", frame=f)
camB.data.dof.focus_distance = 2.4
follow_light(camB, 35, (1, .85, .8))

# =====================================================================
# P : le pancréas libère l'insuline
# =====================================================================
OP = Vector((400, 0, 0))
rnd = random.Random(21)
for i in range(16):
    for j in range(12):
        x, y = (i - 8) * 1.05 + rnd.uniform(-.2, .2), (j - 3) * 1.05 + rnd.uniform(-.2, .2)
        if x * x + y * y < 1.4: continue
        blob(f"lob{i}_{j}", OP + Vector((x, y, rnd.uniform(-.25, 0))), rnd.uniform(.55, .75), M_PANC, seed=i * 31 + j, rough=.25)
ilot = []
for k in range(14):
    a, r = k * 2.4, .35 * math.sqrt(k)
    ilot.append(blob(f"ilot{k}", OP + Vector((math.cos(a) * r, math.sin(a) * r, .25 + rnd.uniform(0, .2))), .32, M_ILOT, seed=200 + k, rough=.2))
def pathPV(s): return Vector((-9 + s * 18, 4.2, 1.0))
vesP = tube("vaisseauP", pathPV, 120, lambda s, a: 1.0, 48, inward=False, offset=OP); vesP.data.materials.append(M_VES)
for k in range(36):
    f0 = 335 + int(k * 1.6)
    o = blob(f"insP{k}", OP + Vector((0, 0, .5)), .12, M_INS, seed=300 + k, rough=.3)
    tgt = OP + Vector((rnd.uniform(-3, 3), 4.2 + rnd.uniform(-.5, .5), 1.0 + rnd.uniform(-.4, .4)))
    midp = OP + Vector((rnd.uniform(-1.5, 1.5), rnd.uniform(.5, 2.5), rnd.uniform(1.4, 2.6)))
    scale_key(o, 317, .001); scale_key(o, f0, .001); scale_key(o, f0 + 6, 1)
    key(o, "location", f0, OP + Vector((rnd.uniform(-.3, .3), rnd.uniform(-.3, .3), .6)))
    key(o, "location", f0 + 40, midp); key(o, "location", min(431, f0 + 75), tgt)
camP = camera("camP", lens=24, fstop=3.5)
def look(cam, f, loc, tgt):
    cam.location = loc; cam.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
    cam.keyframe_insert("location", frame=f); cam.keyframe_insert("rotation_euler", frame=f)
look(camP, 317, OP + Vector((0, -8.5, 5.0)), OP + Vector((0, 0.8, .8)))
look(camP, 431, OP + Vector((.6, -6.2, 3.6)), OP + Vector((0, 1.6, 1.2)))
camP.data.dof.focus_distance = 7
for (loc, e, col) in (((-5, -4, 8), 1800, (1, .85, .7)), ((5, 6, 5), 900, (.6, .8, 1))):
    ld = bpy.data.lights.new("lP", "AREA"); ld.energy = e; ld.size = 8; ld.color = col
    lo = bpy.data.objects.new("lP", ld); sc.collection.objects.link(lo); lo.location = OP + Vector(loc)
    lo.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()

# =====================================================================
# V : on suit l'insuline dans le sang
# =====================================================================
OV = Vector((600, 0, 0))
vesV = tube("vaisseauV", pathB, 360, radB, 72, offset=OV); vesV.data.materials.append(M_VES)
rbc_flow(OV, pathB, 80, 432, 503, 31)
insV = []
for k in range(5):
    o = blob(f"insV{k}", OV, .14, M_INS, seed=400 + k, rough=.3); insV.append(o)
camV = camera("camV", lens=20, fstop=2.2)
for f in range(432, 504, 4):
    s = (f - 432) / 72 * .35
    p = OV + pathB(s); ahead = OV + pathB(s + .05)
    camV.location = p + Vector((0, .2, 0)); camV.rotation_euler = (ahead - p).to_track_quat("-Z", "Y").to_euler()
    camV.keyframe_insert("location", frame=f); camV.keyframe_insert("rotation_euler", frame=f)
    for k, o in enumerate(insV):
        q = OV + pathB(s + .035 + k * .012) + Vector((math.sin(k * 2.1) * .35, math.cos(k * 1.7) * .3, 0))
        o.location = q; o.keyframe_insert("location", frame=f)
camV.data.dof.focus_distance = 1.1
follow_light(camV, 35, (1, .85, .8))

# =====================================================================
# C1 / C2 : la cellule — ouverte, puis bloquée
# =====================================================================
RC = 30.0
def build_cell(O, f0, f1, rusty):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=RC, location=O + Vector((0, 0, -RC)), segments=160, ring_count=80)
    cell = bpy.context.object; bpy.ops.object.shade_smooth(); cell.data.materials.append(M_MEM)
    d = cell.modifiers.new("relief", "DISPLACE"); t2 = bpy.data.textures.new("nC", "CLOUDS"); t2.noise_scale = 1.5
    d.texture = t2; d.strength = .2; d.texture_coords = "GLOBAL"
    def surf(x, y):
        z = math.sqrt(RC * RC - x * x - y * y) - RC
        return O + Vector((x, y, z))
    def receptor(x, y, m, sc_=1.0):
        root = bpy.data.objects.new("rec", None); sc.collection.objects.link(root); root.location = surf(x, y)
        for (px, pz, rx, ln) in ((0, .3, 0, .6), (-.2, .72, .55, .45), (.2, .72, -.55, .45)):
            bpy.ops.mesh.primitive_cylinder_add(radius=.09 * sc_, depth=ln * sc_, location=(px * sc_, 0, pz * sc_), vertices=16)
            o = bpy.context.object; o.rotation_euler = (0, rx, 0); o.data.materials.append(m); o.parent = root
            bev = o.modifiers.new("b", "BEVEL"); bev.width = .04 * sc_; bev.segments = 3; bpy.ops.object.shade_smooth()
        for px in (-.42, .42):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=.11 * sc_, location=(px * sc_, 0, .9 * sc_))
            o = bpy.context.object; o.data.materials.append(m); o.parent = root; bpy.ops.object.shade_smooth()
        return root
    receptor(0, 0, M_RUST if rusty else M_REC)
    for (x, y) in ((-2.6, 1.8), (2.8, 2.4), (-1.6, -3.0), (3.4, -1.6), (-4.2, -.4)):
        receptor(x, y, M_RUST if rusty else M_REC, .9)
    pp = surf(1.2, .35)
    bpy.ops.mesh.primitive_torus_add(major_radius=.3, minor_radius=.09, location=pp + Vector((0, 0, .05)))
    pore = bpy.context.object; pore.data.materials.append(M_STOP if rusty else M_PORE); bpy.ops.object.shade_smooth()
    dock = surf(0, 0) + Vector((0, 0, 1.05))
    if not rusty:
        scale_key(pore, f0, .45); scale_key(pore, f0 + 66, .45); scale_key(pore, f0 + 80, 1.15)
    else:
        scale_key(pore, f0, .45); scale_key(pore, f1, .45)
    ins = bpy.data.objects.new("ins", None); sc.collection.objects.link(ins)
    r = random.Random(5)
    for k in range(9):
        o = blob("insC", (0, 0, 0), .1 + r.random() * .05, M_INS, seed=k, rough=.2)
        o.location = (r.uniform(-.15, .15), r.uniform(-.15, .15), r.uniform(-.12, .12)); o.parent = ins
    key(ins, "location", f0, dock + Vector((-2.6, 1.4, 3.2))); key(ins, "location", f0 + 45, dock + Vector((-.3, .2, .5))); key(ins, "location", f0 + 62, dock)
    key(ins, "rotation_euler", f0, Euler((0, 0, 0))); key(ins, "rotation_euler", f0 + 62, Euler((1.5, .8, 2)))
    n = 7 if not rusty else 18
    for k in range(n):
        a = k * 2 * math.pi / n + (0.3 if rusty else 0)
        rr = 1.5 + (k % 3) * .35 if rusty else 1.4
        start = pp + Vector((math.cos(a) * rr, math.sin(a) * rr, .6 + .25 * math.sin(k)))
        g = glucose(start, .09, "glcC")
        key(g, "rotation_euler", f0, Euler((k, 0, 0))); key(g, "rotation_euler", f1, Euler((k + 3, 2, 1)))
        if not rusty:
            t0 = f0 + 84 + k * 6
            key(g, "location", f0, start); key(g, "location", t0, start + Vector((0, 0, .1)))
            key(g, "location", t0 + 12, pp + Vector((0, 0, .15))); key(g, "location", t0 + 22, pp + Vector((0, 0, -.9)))
        else:
            if k < 7:
                t0 = f0 + 80 + k * 10
                key(g, "location", f0, start); key(g, "location", t0, start)
                key(g, "location", t0 + 12, pp + Vector((0, 0, .45)))
                key(g, "location", t0 + 26, start + Vector((0, 0, .5)))   # rebondit : porte fermée
            else:
                far = start + Vector((r.uniform(-2, 2), r.uniform(-2, 2), 3))
                scale_key(g, f0, 1); key(g, "location", f0, far); key(g, "location", f0 + 60 + k * 8, far.lerp(start, .8))
    for (x, y, z, rad) in ((-18, 34, 6, 5), (20, 40, 9, 6), (2, 48, 12, 7)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=rad, location=O + Vector((x, y, z)), segments=48, ring_count=24)
        o = bpy.context.object; o.data.materials.append(M_CELLBG); bpy.ops.object.shade_smooth()
    for (loc, e, col) in (((-6, -4, 10), 2500, (.9, .8, 1)), ((5, 12, 4), 1500, (.4, .8, 1))):
        ld = bpy.data.lights.new("lC", "AREA"); ld.energy = e; ld.size = 9; ld.color = col
        lo = bpy.data.objects.new("lC", ld); sc.collection.objects.link(lo); lo.location = O + Vector(loc)
        lo.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam = camera("camC2" if rusty else "camC1", lens=28, fstop=2.8)
    tgt = surf(.55, .15) + Vector((0, 0, .5))
    look(cam, f0, tgt + Vector((-1.4, -6.4, 2.8)), tgt)
    look(cam, f0 + 70, tgt + Vector((-.5, -4.2, 1.6)), tgt)
    look(cam, f1, tgt + (Vector((-1.0, -6.0, 3.0)) if rusty else Vector((.3, -3.2, 1.0))), pp if not rusty else tgt)
    cam.data.dof.focus_object = ins
    return cam

camC1 = build_cell(Vector((800, 0, 0)), *FR["C1"], False)
camC2 = build_cell(Vector((1000, 0, 0)), *FR["C2"], True)

# ---------- caméras / brume par plan ----------
CAMS = [("A", camA, 12), ("B", camB, 12), ("P", camP, 45), ("V", camV, 12), ("C1", camC1, 60), ("C2", camC2, 60)]
for k, cam, _ in CAMS:
    m = sc.timeline_markers.new(cam.name, frame=FR[k][0]); m.camera = cam
sc.camera = camA

sc.use_nodes = True
nt = sc.node_tree; N = nt.nodes; Lk = nt.links
for n in list(N): N.remove(n)
rl = N.new("CompositorNodeRLayers")
fog = N.new("CompositorNodeMixRGB"); fog.blend_type = "MIX"; fog.inputs[2].default_value = (0.35, 0.06, 0.08, 1)
mp = N.new("CompositorNodeMath"); mp.operation = "MULTIPLY"; mp.inputs[1].default_value = .55
Lk.new(rl.outputs["Mist"], mp.inputs[0]); Lk.new(mp.outputs[0], fog.inputs[0]); Lk.new(rl.outputs["Image"], fog.inputs[1])
gl = N.new("CompositorNodeGlare"); gl.glare_type = "FOG_GLOW"; gl.quality = "MEDIUM"; gl.threshold = .8; gl.size = 8
Lk.new(fog.outputs[0], gl.inputs[0])
comp = N.new("CompositorNodeComposite"); Lk.new(gl.outputs[0], comp.inputs[0])

def set_cam(f):
    for k, cam, depth in CAMS:
        if FR[k][0] <= f <= FR[k][1]:
            sc.camera = cam; world.mist_settings.depth = depth

os.makedirs(OUT, exist_ok=True)
sc.render.image_settings.file_format = "PNG"
for f in (FRAMES or range(sc.frame_start, sc.frame_end + 1)):
    sc.frame_set(f); set_cam(f)
    sc.render.filepath = os.path.join(OUT, f"f{f:04d}.png")
    bpy.ops.render.render(write_still=True)
    print("rendu", f, flush=True)
