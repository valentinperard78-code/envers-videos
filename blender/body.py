"""Voyage réaliste à l'intérieur du corps (style animation médicale) — La Villa des Pathologies.
Plan A (images 1-150) : intestin. Plan B (151-300) : vaisseau sanguin. Plan C (301-480) : cellule + insuline.
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
sc.frame_start, sc.frame_end = 1, 480
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

M_INT = organic("intestin", (0.62, 0.20, 0.22), (0.85, 0.42, 0.38), (0.35, 0.03, 0.06), bump_scale=55, bump_str=.7)
M_VES = organic("vaisseau", (0.55, 0.06, 0.09), (0.80, 0.25, 0.25), (0.30, 0.0, 0.03), bump_scale=12, bump_str=.25, voro=False)
M_RBC = mat("globule", (0.55, 0.02, 0.04), .32, .7, (1, .15, .1), .08, coat=.4)
M_FOOD = mat("nourriture", (0.85, 0.62, 0.30), .5, .5, (1, .8, .5), .1)
M_GLU = glow("glucose", (0.75, 0.92, 1.0), 6.0)
M_BOND = glow("liaison", (0.5, 0.8, 1.0), 2.5)
M_MEM = organic("membrane", (0.42, 0.20, 0.55), (0.65, 0.40, 0.72), (0.25, 0.08, 0.35), bump_scale=90, bump_str=.45, sss=.7, coat=.5)
M_REC = mat("recepteur", (0.10, 0.55, 0.60), .3, .5, (.3, 1, 1), .05, coat=.5)
M_INS = mat("insuline", (0.95, 0.65, 0.12), .25, .3, (1, .7, .2), .05, coat=.7, emit=(1, .6, .1), emit_s=.6)
M_PORE = glow("canal", (0.4, 1.0, 0.7), 3.0)
M_CELLBG = mat("cellules_fond", (0.35, 0.12, 0.45), .4, .6, (1, .4, 1), .3)

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

# =====================================================================
# PLAN A : INTESTIN (origine 0,0,0)
# =====================================================================
LA = 26.0
def pathA(s):
    z = s * LA
    return Vector((0.9 * math.sin(z * .22), 0.6 * math.sin(z * .17 + 1), -z))
def radA(s, a):
    z = s * LA
    fold = 0.22 * (0.5 + 0.5 * math.cos(z * 2.2)) ** 6        # replis circulaires
    return 1.6 * (1 - fold) + 0.08 * math.sin(a * 5 + z * 1.3) + 0.05 * math.sin(a * 11 - z)
intA = tube("intestin", pathA, 420, radA, 96)
intA.data.materials.append(M_INT)
dA = intA.modifiers.new("relief", "DISPLACE"); tx = bpy.data.textures.new("nuages", "CLOUDS"); tx.noise_scale = .6
dA.texture = tx; dA.strength = .18; dA.texture_coords = "GLOBAL"
# morceaux de nourriture + sucres qui s'en échappent
rnd = random.Random(3)
for k in range(14):
    s = .12 + k * .055
    c = pathA(s) + Vector((rnd.uniform(-.8, .8), rnd.uniform(-.8, .8), 0))
    blob(f"bol{k}", c, rnd.uniform(.18, .38), M_FOOD, seed=k, rough=.45)
GLU_A = []
for k in range(26):
    s = .08 + k * .032
    c = pathA(s) + Vector((rnd.uniform(-1.1, 1.1), rnd.uniform(-1.1, 1.1), rnd.uniform(-.3, .3)))
    g = glucose(c, .09, f"glcA{k}"); g.rotation_euler = (rnd.random() * 3, rnd.random() * 3, rnd.random() * 3)
    # dérive vers la paroi (absorption)
    c2 = pathA(s) + (c - pathA(s)).normalized() * 1.5
    key(g, "location", 1, c); key(g, "location", 150, c.lerp(c2, .8))
    key(g, "rotation_euler", 1, g.rotation_euler.copy()); key(g, "rotation_euler", 150, Euler((g.rotation_euler.x + 2, g.rotation_euler.y + 1, 0)))
    lin_keys(g); GLU_A.append(g)
camA = camera("camA", lens=18, fstop=2.2)
for f in range(1, 151, 5):
    s = .02 + (f - 1) / 150 * .55
    p = pathA(s); ahead = pathA(s + .04)
    camA.location = p + Vector((.25, .2, 0)); camA.rotation_euler = (ahead - p).to_track_quat("-Z", "Y").to_euler()
    camA.keyframe_insert("location", frame=f); camA.keyframe_insert("rotation_euler", frame=f)
camA.data.dof.focus_distance = 2.2
follow_light(camA, 60, (1, .82, .7))

# =====================================================================
# PLAN B : VAISSEAU SANGUIN (décalé en x = 200)
# =====================================================================
OB = Vector((200, 0, 0)); LB = 30.0
def pathB(s):
    z = s * LB
    return Vector((1.2 * math.sin(z * .12), .7 * math.sin(z * .09 + .5), -z))
def radB(s, a): return 1.25 + .04 * math.sin(a * 6 + s * 40)
vesB = tube("vaisseau", pathB, 360, radB, 72, offset=OB); vesB.data.materials.append(M_VES)
rnd = random.Random(11)
for k in range(90):
    s = rnd.random() * .95
    c = OB + pathB(s) + Vector((rnd.uniform(-.85, .85), rnd.uniform(-.85, .85), 0))
    o = bpy.data.objects.new(f"rbc{k}", RBC); sc.collection.objects.link(o)
    o.scale = (.32, .32, .32); o.rotation_euler = (rnd.random() * 3, rnd.random() * 3, rnd.random() * 3)
    key(o, "location", 151, c); key(o, "location", 300, c + Vector((0, 0, -rnd.uniform(2.5, 4.5))))
    key(o, "rotation_euler", 151, o.rotation_euler.copy()); key(o, "rotation_euler", 300, Euler((o.rotation_euler.x + 1.5, o.rotation_euler.y, o.rotation_euler.z + 1)))
    lin_keys(o)
for k in range(30):
    s = rnd.random() * .9
    c = OB + pathB(s) + Vector((rnd.uniform(-.8, .8), rnd.uniform(-.8, .8), 0))
    g = glucose(c, .08, f"glcB{k}"); g.rotation_euler = (rnd.random() * 3, rnd.random() * 3, 0)
    key(g, "location", 151, c); key(g, "location", 300, c + Vector((0, 0, -rnd.uniform(3, 5)))); lin_keys(g)
camB = camera("camB", lens=20, fstop=2.0)
for f in range(151, 301, 5):
    s = .03 + (f - 151) / 150 * .45
    p = OB + pathB(s); ahead = OB + pathB(s + .04)
    camB.location = p; camB.rotation_euler = (ahead - p).to_track_quat("-Z", "Y").to_euler()
    camB.keyframe_insert("location", frame=f); camB.keyframe_insert("rotation_euler", frame=f)
camB.data.dof.focus_distance = 1.6
follow_light(camB, 45, (1, .75, .7))

# =====================================================================
# PLAN C : CELLULE + INSULINE (décalé en x = 400)
# =====================================================================
OC = Vector((400, 0, 0))
RC = 30.0
bpy.ops.mesh.primitive_uv_sphere_add(radius=RC, location=OC + Vector((0, 0, -RC)), segments=160, ring_count=80)
cell = bpy.context.object; cell.name = "cellule"; bpy.ops.object.shade_smooth(); cell.data.materials.append(M_MEM)
dC = cell.modifiers.new("relief", "DISPLACE"); t2 = bpy.data.textures.new("nuagesC", "CLOUDS"); t2.noise_scale = 1.5
dC.texture = t2; dC.strength = .25; dC.texture_coords = "GLOBAL"
def on_surface(x, y):
    d = Vector((x, y, 0)); z = math.sqrt(RC * RC - d.length_squared) - RC
    return OC + Vector((x, y, z))
def receptor(x, y, name, scale=1.0):
    root = bpy.data.objects.new(name, None); sc.collection.objects.link(root); root.location = on_surface(x, y)
    for (px, pz, rx, ln) in ((0, .25, 0, .5), (-.18, .62, .55, .42), (.18, .62, -.55, .42)):
        bpy.ops.mesh.primitive_cylinder_add(radius=.07 * scale, depth=ln * scale, location=(px * scale, 0, pz * scale), vertices=16)
        o = bpy.context.object; o.rotation_euler = (0, rx, 0); o.data.materials.append(M_REC); o.parent = root
        bev = o.modifiers.new("b", "BEVEL"); bev.width = .03 * scale; bev.segments = 3; bpy.ops.object.shade_smooth()
    return root
recs = [receptor(x, y, f"rec{k}") for k, (x, y) in enumerate(((0, 0), (-2.4, 1.6), (2.6, 2.2), (-1.5, -2.8), (3.2, -1.4), (-4, -.5)))]
# canal à glucose (GLUT4) près du récepteur principal
bpy.ops.mesh.primitive_torus_add(major_radius=.28, minor_radius=.08, location=on_surface(1.1, .3) + Vector((0, 0, .05)))
pore = bpy.context.object; pore.name = "canal"; pore.data.materials.append(M_PORE); bpy.ops.object.shade_smooth()
key(pore, "scale", 301, Vector((.4, .4, .4))); key(pore, "scale", 420, Vector((.4, .4, .4))); key(pore, "scale", 440, Vector((1, 1, 1)))
# insuline : grappe dorée qui descend se fixer sur le récepteur
ins = bpy.data.objects.new("insuline", None); sc.collection.objects.link(ins)
rnd = random.Random(5)
for k in range(9):
    o = blob(f"ins{k}", (0, 0, 0), .1 + rnd.random() * .05, M_INS, seed=k, rough=.2)
    o.location = (rnd.uniform(-.15, .15), rnd.uniform(-.15, .15), rnd.uniform(-.12, .12)); o.parent = ins
top = on_surface(0, 0) + Vector((0, 0, .95))
key(ins, "location", 301, top + Vector((-2.5, 1.5, 3.0))); key(ins, "location", 380, top + Vector((-.3, .2, .5))); key(ins, "location", 405, top)
key(ins, "rotation_euler", 301, Euler((0, 0, 0))); key(ins, "rotation_euler", 405, Euler((1.5, .8, 2)))
# sucres qui attendent puis entrent par le canal
for k in range(7):
    a = k * 2 * math.pi / 7
    start = on_surface(1.1, .3) + Vector((math.cos(a) * 1.4, math.sin(a) * 1.4, .6 + .2 * math.sin(k)))
    g = glucose(start, .09, f"glcC{k}")
    key(g, "location", 301, start); key(g, "location", 425 + k * 6, start + Vector((0, 0, .1)))
    key(g, "location", 445 + k * 6, on_surface(1.1, .3) + Vector((0, 0, .1)))
    key(g, "location", 460 + k * 6, on_surface(1.1, .3) + Vector((0, 0, -.8)))
    key(g, "rotation_euler", 301, Euler((k, 0, 0))); key(g, "rotation_euler", 480, Euler((k + 3, 2, 1)))
# autres cellules floues au loin
for k, (x, y, z, r) in enumerate(((-14, 18, 3, 7), (16, 22, 5, 9), (0, 30, 8, 10), (-22, 8, 1, 6))):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=OC + Vector((x, y, z)), segments=48, ring_count=24)
    o = bpy.context.object; o.data.materials.append(M_CELLBG); bpy.ops.object.shade_smooth()
camC = camera("camC", lens=28, fstop=2.2)
def look(cam, f, loc, tgt):
    cam.location = loc; cam.rotation_euler = (tgt - loc).to_track_quat("-Z", "Y").to_euler()
    cam.keyframe_insert("location", frame=f); cam.keyframe_insert("rotation_euler", frame=f)
tgt = on_surface(.5, .15) + Vector((0, 0, .5))
look(camC, 301, tgt + Vector((-1.5, -6.5, 2.6)), tgt)
look(camC, 400, tgt + Vector((-.6, -4.0, 1.4)), tgt)
look(camC, 480, tgt + Vector((.3, -3.0, .9)), on_surface(1.1, .3))
camC.data.dof.focus_object = ins
sun = bpy.data.lights.new("lumC", "AREA"); sun.energy = 2500; sun.size = 10; sun.color = (.8, .7, 1)
so = bpy.data.objects.new("lumC", sun); sc.collection.objects.link(so); so.location = OC + Vector((-6, -4, 10)); so.rotation_euler = (.5, -.4, 0)
rim = bpy.data.lights.new("rimC", "AREA"); rim.energy = 1500; rim.size = 8; rim.color = (.4, .8, 1)
ro = bpy.data.objects.new("rimC", rim); sc.collection.objects.link(ro); ro.location = OC + Vector((5, 12, 4)); ro.rotation_euler = (-1.2, 0, 3.0)

# ---------- caméras par plan ----------
for f, cam in ((1, camA), (151, camB), (301, camC)):
    m = sc.timeline_markers.new(cam.name, frame=f); m.camera = cam
sc.camera = camA

# ---------- compositing : brume de profondeur + halo ----------
sc.use_nodes = True
nt = sc.node_tree; N = nt.nodes; Lk = nt.links
for n in list(N): N.remove(n)
rl = N.new("CompositorNodeRLayers")
fog = N.new("CompositorNodeMixRGB"); fog.blend_type = "MIX"; fog.inputs[2].default_value = (0.25, 0.03, 0.04, 1)
mp = N.new("CompositorNodeMath"); mp.operation = "MULTIPLY"; mp.inputs[1].default_value = .65
Lk.new(rl.outputs["Mist"], mp.inputs[0]); Lk.new(mp.outputs[0], fog.inputs[0]); Lk.new(rl.outputs["Image"], fog.inputs[1])
gl = N.new("CompositorNodeGlare"); gl.glare_type = "FOG_GLOW"; gl.quality = "MEDIUM"; gl.threshold = .8; gl.size = 8
Lk.new(fog.outputs[0], gl.inputs[0])
lens = N.new("CompositorNodeLensdist"); lens.inputs["Dispersion"].default_value = .012; lens.inputs["Distort"].default_value = -.02
Lk.new(gl.outputs[0], lens.inputs[0])
comp = N.new("CompositorNodeComposite"); Lk.new(lens.outputs[0], comp.inputs[0])

def set_cam(f):
    sc.camera = camA if f < 151 else (camB if f < 301 else camC)
    world.mist_settings.depth = 14 if f < 301 else 60

os.makedirs(OUT, exist_ok=True)
if FRAMES:
    sc.render.image_settings.file_format = "PNG"
    for f in FRAMES:
        sc.frame_set(f); set_cam(f)
        sc.render.filepath = os.path.join(OUT, f"f{f:04d}.png")
        bpy.ops.render.render(write_still=True)
        print("rendu", f, flush=True)
else:
    sc.render.image_settings.file_format = "PNG"
    for f in range(sc.frame_start, sc.frame_end + 1):
        sc.frame_set(f); set_cam(f)
        sc.render.filepath = os.path.join(OUT, f"f{f:04d}.png")
        bpy.ops.render.render(write_still=True)
