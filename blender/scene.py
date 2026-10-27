"""La Villa des Pathologies — prototype Blender (4.2).
blender -b -P scene.py -- <out_dir> <frame> [<frame> ...]   (rend les images demandées)
Scène : soir dans la villa ; le chien Insuline marche jusqu'à Cellia (la cellule),
glisse la clé dans la serrure, la tourne, la porte s'ouvre et Sucrette (glucose) entre."""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
# Sans argument (PC de Valentin) : vidéo complète en pleine qualité, sur la carte graphique.
OUT = argv[0] if argv else os.path.join(os.path.dirname(os.path.abspath(__file__)), "rendu")
ANIM = len(argv) <= 1
FRAMES = [int(x) for x in argv[1:]] or [1]
RES = (int(os.environ.get("RES_X", 1080 if ANIM else 720)), int(os.environ.get("RES_Y", 1920 if ANIM else 1280)))
SAMPLES = int(os.environ.get("SAMPLES", 96 if ANIM else 48))
FPS = 24
END = 216            # 9 s

random.seed(3)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
def use_gpu():
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                gpus = [d for d in prefs.devices if d.type == kind]
                if gpus:
                    for d in prefs.devices:
                        d.use = d.type == kind
                    sc.cycles.device = "GPU"
                    print("Rendu sur la carte graphique :", kind, [d.name for d in gpus])
                    return
            except Exception:
                pass
    except Exception as e:
        print("GPU indisponible :", e)
    print("Rendu sur le processeur (CPU)")
use_gpu()
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
try:
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
except Exception:
    pass
sc.cycles.max_bounces = 6
sc.render.resolution_x, sc.render.resolution_y = RES
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 1, END
sc.view_settings.view_transform = "AgX"
try:
    sc.view_settings.look = "AgX - High Contrast"
except Exception:
    pass
sc.render.image_settings.file_format = "PNG"
sc.render.film_transparent = False
sc.render.use_persistent_data = True
sc.view_settings.exposure = -0.9


# ---------------------------------------------------------------- utilitaires
def mat(name, color, rough=0.45, sss=0.0, sss_col=None, coat=0.0, metal=0.0, emit=None, emit_s=0.0, transm=0.0, ior=1.45, bump=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if sss:
        p.inputs["Subsurface Weight"].default_value = sss
        p.inputs["Subsurface Radius"].default_value = sss_col or (1.0, 0.4, 0.3)
        p.inputs["Subsurface Scale"].default_value = 0.08
    if coat:
        p.inputs["Coat Weight"].default_value = coat
        p.inputs["Coat Roughness"].default_value = 0.08
    if transm:
        p.inputs["Transmission Weight"].default_value = transm
        p.inputs["IOR"].default_value = ior
    if emit:
        p.inputs["Emission Color"].default_value = (*emit, 1)
        p.inputs["Emission Strength"].default_value = emit_s
    if bump:  # (échelle, force)
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = bump[0]
        tex.inputs["Detail"].default_value = 8
        b = nt.nodes.new("ShaderNodeBump")
        b.inputs["Strength"].default_value = bump[1]
        nt.links.new(tex.outputs["Fac"], b.inputs["Height"])
        nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    return m


def obj_from(op, name, mt=None, smooth=True, **kw):
    op(**kw)
    o = bpy.context.active_object
    o.name = name
    if mt:
        o.data.materials.append(mt)
    if smooth and o.type == "MESH":
        for poly in o.data.polygons:
            poly.use_smooth = True
    return o


def sphere(name, r, loc, mt, seg=48, scale=(1, 1, 1)):
    o = obj_from(bpy.ops.mesh.primitive_uv_sphere_add, name, mt, radius=r, location=loc, segments=seg, ring_count=seg // 2)
    o.scale = scale
    return o


def subsurf(o, lv=2):
    m = o.modifiers.new("sub", "SUBSURF")
    m.levels = m.render_levels = lv
    return m


def parent(child, par):
    child.parent = par
    child.matrix_parent_inverse = par.matrix_world.inverted()


def key(o, path, frame, value=None, idx=-1):
    if value is not None:
        setattr(o, path, value)
    o.keyframe_insert(data_path=path, frame=frame, index=idx)


def smooth_fcurves(o, interp="BEZIER"):
    ad = o.animation_data
    if ad and ad.action:
        for fc in ad.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = interp


# ---------------------------------------------------------------- monde : coucher de soleil
world = bpy.data.worlds.new("Sky")
sc.world = world
world.use_nodes = True
wn = world.node_tree
sky = wn.nodes.new("ShaderNodeTexSky")
sky.sky_type = "NISHITA"
sky.sun_elevation = math.radians(7)
sky.sun_rotation = math.radians(200)
sky.air_density = 1.4
sky.dust_density = 2.5
bg = wn.nodes["Background"]
bg.inputs["Strength"].default_value = 0.35
wn.links.new(sky.outputs["Color"], bg.inputs["Color"])

sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sc.collection.objects.link(sun)
sun.data.energy = 3.0
sun.data.color = (1.0, 0.62, 0.38)
sun.data.angle = math.radians(3)
sun.rotation_euler = Euler((math.radians(80), 0, math.radians(200)))

fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "AREA"))
sc.collection.objects.link(fill)
fill.data.energy = 500
fill.data.size = 6
fill.data.color = (0.75, 0.8, 1.0)
fill.location = (2.5, -6.5, 4.5)
fill.rotation_euler = Euler((math.radians(55), 0, math.radians(20)))

# ---------------------------------------------------------------- décor : la villa
M_TILE = mat("Dallage", (0.3, 0.25, 0.21), rough=0.4, bump=(18, 0.25))
M_WALL = mat("Enduit", (0.72, 0.66, 0.6), rough=0.8, bump=(6, 0.08))
M_WIN = mat("Fenetre", (1.0, 0.75, 0.45), emit=(1.0, 0.62, 0.3), emit_s=3)
M_WATER = mat("Eau", (0.25, 0.75, 0.85), rough=0.02, transm=0.9, ior=1.33, bump=(3, 0.15))
M_POOLTILE = mat("Bassin", (0.1, 0.55, 0.75), rough=0.3)
M_WOOD = mat("Bois", (0.36, 0.2, 0.1), rough=0.5, bump=(40, 0.2))
M_LEAF = mat("Palme", (0.08, 0.28, 0.08), rough=0.6)
M_TRUNK = mat("Tronc", (0.35, 0.25, 0.17), rough=0.8, bump=(25, 0.4))
M_BULB = mat("Ampoule", (1.0, 0.85, 0.6), emit=(1.0, 0.8, 0.5), emit_s=25)

obj_from(bpy.ops.mesh.primitive_plane_add, "Sol", M_TILE, size=60, location=(0, 0, 0))
# piscine (à droite, derrière)
obj_from(bpy.ops.mesh.primitive_cube_add, "Bassin", M_POOLTILE, size=1, location=(4.2, 3.0, -0.25)).scale = (5, 3.4, 0.5)
obj_from(bpy.ops.mesh.primitive_plane_add, "Eau", M_WATER, size=1, location=(4.2, 3.0, -0.04)).scale = (4.8, 3.2, 1)
for (x, y, sx, sy) in ((4.2, 1.25, 5.2, 0.25), (4.2, 4.75, 5.2, 0.25), (1.65, 3.0, 0.25, 3.7), (6.75, 3.0, 0.25, 3.7)):
    obj_from(bpy.ops.mesh.primitive_cube_add, "Margelle", M_WALL, size=1, location=(x, y, 0.03)).scale = (sx, sy, 0.08)
# villa (fond)
body = obj_from(bpy.ops.mesh.primitive_cube_add, "Villa", M_WALL, size=1, location=(0, 11, 2.2), smooth=False)
body.scale = (16, 5, 4.4)
up = obj_from(bpy.ops.mesh.primitive_cube_add, "Etage", M_WALL, size=1, location=(-1.5, 11.3, 5.6), smooth=False)
up.scale = (9, 4, 2.6)
obj_from(bpy.ops.mesh.primitive_cube_add, "Toit", mat("Toit", (0.85, 0.82, 0.78), rough=0.6), size=1, location=(-1.5, 11.3, 7.0), smooth=False).scale = (9.6, 4.6, 0.2)
for k in range(6):
    obj_from(bpy.ops.mesh.primitive_cube_add, f"Baie{k}", M_WIN, size=1, location=(-6.5 + k * 2.6, 8.49, 1.6), smooth=False).scale = (1.7, 0.02, 2.4)
for k in range(3):
    obj_from(bpy.ops.mesh.primitive_cube_add, f"Fen{k}", M_WIN, size=1, location=(-4.5 + k * 3, 9.29, 5.5), smooth=False).scale = (1.4, 0.02, 1.3)
# guirlande
for k in range(26):
    x = -7 + k * 0.56
    z = 4.2 - 0.35 * math.sin(k / 25 * math.pi)
    obj_from(bpy.ops.mesh.primitive_uv_sphere_add, f"Bulbe{k}", M_BULB, radius=0.06, location=(x, 8.3, z), segments=12, ring_count=6)
# palmiers
def palm(x, y, h, lean):
    t = obj_from(bpy.ops.mesh.primitive_cone_add, "Tronc", M_TRUNK, radius1=0.22, radius2=0.12, depth=h, location=(x, y, h / 2), vertices=16)
    t.rotation_euler = (0, lean, 0)
    top = Vector((x + math.sin(lean) * h / 2 * 1.0, y, h * math.cos(lean)))
    for k in range(16):
        a = k / 16 * 2 * math.pi
        l = obj_from(bpy.ops.mesh.primitive_plane_add, "Palme", M_LEAF, size=1, location=top)
        l.scale = (2.6, 0.45, 1)
        l.rotation_euler = (0, math.radians(25), a)
        l.location = top + Vector((math.cos(a) * 1.1, math.sin(a) * 1.1, -0.35))
        sb = l.modifiers.new("b", "SIMPLE_DEFORM"); sb.deform_method = "BEND"; sb.angle = math.radians(-50); sb.deform_axis = "Y"
palm(-6.5, 6.5, 6.5, 0.12)
palm(8.0, 7.5, 7.5, -0.15)
palm(-9.5, 9.0, 5.5, 0.05)

# ---------------------------------------------------------------- personnages
def face(par, center, fwd, r_eye, spacing, mouth_w, mood="happy", eye_up=0.0, mouth_push=0.0):
    """Ajoute deux yeux et une bouche sur un personnage (fwd = direction du visage)."""
    M_EYE = mat("Oeil", (0.95, 0.95, 0.95), rough=0.15, coat=1.0)
    M_PUP = mat("Pupille", (0.01, 0.01, 0.015), rough=0.1, coat=1.0)
    M_MOUTH = mat("Bouche", (0.25, 0.02, 0.05), rough=0.4)
    fwd = Vector(fwd).normalized()
    side = fwd.cross(Vector((0, 0, 1))).normalized()
    eyes = []
    for s in (-1, 1):
        c = Vector(center) + side * s * spacing + Vector((0, 0, eye_up))
        e = sphere("Oeil", r_eye, c, M_EYE, seg=32)
        e.scale = (1, 1, 1.15)
        p = sphere("Pupille", r_eye * 0.52, c + fwd * r_eye * 0.72, M_PUP, seg=24)
        hl = sphere("Reflet", r_eye * 0.16, c + fwd * r_eye * 0.98 + Vector((0, 0, r_eye * 0.3)) - side * r_eye * 0.2, mat("Reflet", (1, 1, 1), emit=(1, 1, 1), emit_s=4), seg=12)
        parent(p, e); parent(hl, e)
        parent(e, par)
        eyes.append(e)
    m = obj_from(bpy.ops.mesh.primitive_torus_add, "Bouche", M_MOUTH, major_radius=mouth_w, minor_radius=mouth_w * 0.22,
                 location=Vector(center) - Vector((0, 0, r_eye * 2.2)) + fwd * (r_eye * 0.1 + mouth_push), major_segments=32, minor_segments=12)
    m.rotation_euler = Euler((math.radians(90), 0, math.atan2(fwd.y, fwd.x) - math.pi / 2))
    m.scale = (1, 0.55 if mood != "angry" else 0.3, 1)
    parent(m, par)
    return eyes, m


def blink(eyes, frames):
    for e in eyes:
        for f in frames:
            e.scale = (1, 1, 1.15); e.keyframe_insert("scale", frame=f - 2)
            e.scale = (1, 1, 0.08); e.keyframe_insert("scale", frame=f)
            e.scale = (1, 1, 1.15); e.keyframe_insert("scale", frame=f + 3)


def talk(mouth, f0, f1, base=0.55):
    f = f0
    while f < f1:
        mouth.scale = (1, base + random.random() * 0.9, 1); mouth.keyframe_insert("scale", frame=f)
        f += random.choice((3, 4, 5))
    mouth.scale = (1, base, 1); mouth.keyframe_insert("scale", frame=f1)


# --- Cellia (la cellule) : grosse sphère violette, face à la caméra (axe -Y)
CC = Vector((1.3, 1.2, 1.4)); R = 1.4
M_CELL = mat("Cellule", (0.16, 0.03, 0.55), rough=0.3, coat=0.7, bump=(4, 0.1))
cell = sphere("Cellia", R, CC, M_CELL, seg=64)
dis = cell.modifiers.new("d", "DISPLACE")
dis.texture = bpy.data.textures.new("tc", "CLOUDS"); dis.texture.noise_scale = 0.9; dis.strength = 0.08
subsurf(cell, 1)
nuc = sphere("Noyau", 0.42, CC + Vector((0.65, 0.2, 0.75)), mat("Noyau", (0.2, 0.04, 0.4), rough=0.4, sss=0.3), seg=32)
parent(nuc, cell)
def on_sphere(dx, dz, push=1.0):
    d = Vector((dx, -1.0, dz)).normalized()
    return CC + d * R * push, d
eye_pos, eye_n = on_sphere(0.28, 0.42, 0.93)
eyes_c, mouth_c = face(cell, eye_pos, Vector((eye_n.x, eye_n.y, 0)), 0.2, 0.3, 0.15, mouth_push=0.12)
# porte en bas à gauche, tournée vers la caméra
door_pos, door_n = on_sphere(-0.48, -0.42, 1.0)
DN = Vector((door_n.x, door_n.y, 0)).normalized()          # normale horizontale
ang = math.atan2(DN.y, DN.x)
side_vec = Vector((-DN.y, DN.x, 0))                        # vers la droite de la porte (vu de face)
door_center = door_pos + DN * 0.02
door_center.z = 0.72
M_DARK = mat("Embrasure", (0.04, 0.0, 0.05), rough=0.9)
emb = obj_from(bpy.ops.mesh.primitive_cube_add, "Embrasure", M_DARK, size=1, location=door_center - DN * 0.05)
emb.scale = (0.72, 0.2, 1.22); emb.rotation_euler = Euler((0, 0, ang + math.pi / 2))
bve = emb.modifiers.new("bv", "BEVEL"); bve.width = 0.2; bve.segments = 6
parent(emb, cell)
hinge = bpy.data.objects.new("Charniere", None); sc.collection.objects.link(hinge)
hinge.location = door_center + side_vec * 0.33 + DN * 0.08
hinge.rotation_euler = Euler((0, 0, ang + math.pi / 2))
door = obj_from(bpy.ops.mesh.primitive_cube_add, "Porte", M_WOOD, size=1, location=door_center + DN * 0.08)
door.scale = (0.64, 0.07, 1.12)
door.rotation_euler = Euler((0, 0, ang + math.pi / 2))
bv = door.modifiers.new("bv", "BEVEL"); bv.width = 0.12; bv.segments = 6
parent(door, hinge)
M_GOLD = mat("Or", (1.0, 0.72, 0.22), rough=0.18, metal=1.0)
lock_loc = door_center + DN * 0.13 - side_vec * 0.18
lock = obj_from(bpy.ops.mesh.primitive_cylinder_add, "Serrure", M_GOLD, radius=0.075, depth=0.04, location=lock_loc, vertices=24)
lock.rotation_euler = Euler((math.radians(90), 0, ang + math.pi / 2))
parent(lock, door)
hole = obj_from(bpy.ops.mesh.primitive_cube_add, "TrouSerrure", M_DARK, size=1, location=lock_loc + DN * 0.022)
hole.scale = (0.025, 0.01, 0.07); hole.rotation_euler = Euler((0, 0, ang + math.pi / 2)); parent(hole, door)
keyhole_world = lock_loc + DN * 0.03

# --- Insuline (le chien)
M_FUR = mat("Pelage", (0.62, 0.32, 0.08), rough=0.75, sss=0.1, bump=(70, 0.4))
M_FUR2 = mat("Pelage2", (0.9, 0.75, 0.55), rough=0.75, bump=(70, 0.3))
M_NOSE = mat("Truffe", (0.02, 0.015, 0.015), rough=0.15, coat=1)
M_COLLAR = mat("Collier", (0.8, 0.03, 0.1), rough=0.35)
dog = bpy.data.objects.new("Chien", None); sc.collection.objects.link(dog)
torso = sphere("Torse", 0.36, (0, 0, 0.62), M_FUR); torso.scale = (1.35, 0.85, 0.85); parent(torso, dog)
head = sphere("Tete", 0.3, (0.5, 0, 1.0), M_FUR); parent(head, dog)
snout = sphere("Museau", 0.16, (0.77, 0, 0.92), M_FUR2); snout.scale = (1.2, 1, 0.8); parent(snout, head)
nose = sphere("Truffe", 0.065, (0.95, 0, 0.97), M_NOSE); parent(nose, head)
for s_ in (-1, 1):
    ear = sphere("Oreille", 0.15, (0.4, s_ * 0.28, 1.08), mat("Oreille", (0.35, 0.16, 0.05), rough=0.7)); ear.scale = (0.6, 0.35, 1.3)
    ear.rotation_euler = (s_ * 0.35, 0, 0); parent(ear, head)
eyes_d, mouth_d = face(head, (0.74, 0, 1.13), (1, 0, 0), 0.07, 0.11, 0.065)
collar = obj_from(bpy.ops.mesh.primitive_torus_add, "Collier", M_COLLAR, major_radius=0.24, minor_radius=0.045, location=(0.36, 0, 0.8))
collar.rotation_euler = (0, math.radians(65), 0); parent(collar, dog)
legs = []
for (lx, ly) in ((0.3, 0.19), (0.3, -0.19), (-0.3, 0.19), (-0.3, -0.19)):
    piv = bpy.data.objects.new("Hanche", None); sc.collection.objects.link(piv)
    piv.location = (lx, ly, 0.5); parent(piv, dog)
    leg = obj_from(bpy.ops.mesh.primitive_cylinder_add, "Patte", M_FUR, radius=0.08, depth=0.48, location=(lx, ly, 0.27), vertices=20)
    paw = sphere("Pied", 0.1, (lx + 0.04, ly, 0.05), M_FUR2); paw.scale = (1.3, 1, 0.6)
    parent(leg, piv); parent(paw, piv)
    legs.append(piv)
tpiv = bpy.data.objects.new("QueuePiv", None); sc.collection.objects.link(tpiv); tpiv.location = (-0.46, 0, 0.75); parent(tpiv, dog)
tail = obj_from(bpy.ops.mesh.primitive_cone_add, "Queue", M_FUR, radius1=0.07, radius2=0.02, depth=0.45, location=(-0.58, 0, 0.88), vertices=16)
tail.rotation_euler = (0, math.radians(-55), 0); parent(tail, tpiv)

# --- clé (grande, dorée)
keyo = bpy.data.objects.new("Cle", None); sc.collection.objects.link(keyo)
ring = obj_from(bpy.ops.mesh.primitive_torus_add, "Anneau", M_GOLD, major_radius=0.1, minor_radius=0.03, location=(0, 0, 0))
ring.rotation_euler = (math.radians(90), 0, 0); parent(ring, keyo)
shaft = obj_from(bpy.ops.mesh.primitive_cylinder_add, "Tige", M_GOLD, radius=0.026, depth=0.3, location=(0.25, 0, 0))
shaft.rotation_euler = (0, math.radians(90), 0); parent(shaft, keyo)
bit = obj_from(bpy.ops.mesh.primitive_cube_add, "Panneton", M_GOLD, size=1, location=(0.36, 0, -0.06)); bit.scale = (0.06, 0.025, 0.1); parent(bit, keyo)

# --- Sucrette (glucose)
M_SUGAR = mat("Sucre", (0.92, 0.92, 0.95), rough=0.6, sss=0.25, sss_col=(1, 1, 1), bump=(160, 0.7))
SUG0 = Vector((-1.9, -0.9, 0.31))
sug = obj_from(bpy.ops.mesh.primitive_cube_add, "Sucrette", M_SUGAR, size=0.62, location=SUG0)
bvs = sug.modifiers.new("bv", "BEVEL"); bvs.width = 0.1; bvs.segments = 5
eyes_s, mouth_s = face(sug, SUG0 + Vector((0, -0.32, 0.09)), (0, -1, 0), 0.07, 0.12, 0.06)

# ---------------------------------------------------------------- animation
stand = door_center + DN * 1.05; stand.z = 0
start = Vector((-3.6, -2.9, 0))
walk_dir = (stand - start).normalized()
dog.location = start; dog.rotation_euler = (0, 0, math.atan2(walk_dir.y, walk_dir.x))
key(dog, "location", 1); key(dog, "rotation_euler", 1)
key(dog, "location", 84, stand); key(dog, "rotation_euler", 84)
dog.rotation_euler = (0, 0, ang + math.pi); key(dog, "rotation_euler", 96)   # se tourne vers la porte
for f in range(1, 85, 6):
    for i, piv in enumerate(legs):
        ph = 1 if i in (0, 3) else -1
        piv.rotation_euler = (0, ph * 0.45 * (1 if (f // 6) % 2 == 0 else -1), 0); piv.keyframe_insert("rotation_euler", frame=f)
    torso.location = (0, 0, 0.62 + (0.03 if (f // 6) % 2 == 0 else 0)); torso.keyframe_insert("location", frame=f)
for piv in legs:
    piv.rotation_euler = (0, 0, 0); piv.keyframe_insert("rotation_euler", frame=92)
for f in range(1, END, 5):
    tpiv.rotation_euler = (0, 0, 0.5 * (1 if (f // 5) % 2 == 0 else -1)); tpiv.keyframe_insert("rotation_euler", frame=f)
head.rotation_euler = (0, 0, 0); head.keyframe_insert("rotation_euler", frame=96)
head.rotation_euler = (0, -0.2, 0); head.keyframe_insert("rotation_euler", frame=104)
head.rotation_euler = (0, -0.2, 0); head.keyframe_insert("rotation_euler", frame=140)
head.rotation_euler = (0, 0.15, 0.35); head.keyframe_insert("rotation_euler", frame=160)

def mouth_world(base, yaw):
    return base + Vector((math.cos(yaw), math.sin(yaw), 0)) * 0.98 + Vector((0, 0, 0.9))
yaw_w = math.atan2(walk_dir.y, walk_dir.x)
key(keyo, "location", 1, mouth_world(start, yaw_w)); keyo.rotation_euler = (0, 0, yaw_w); key(keyo, "rotation_euler", 1)
key(keyo, "location", 84, mouth_world(stand, yaw_w)); key(keyo, "rotation_euler", 84)
key(keyo, "location", 96, mouth_world(stand, ang + math.pi)); keyo.rotation_euler = (0, 0, ang + math.pi); key(keyo, "rotation_euler", 96)
# la clé glisse dans la serrure (le bout entre dans le trou)
key(keyo, "location", 116, keyhole_world + DN * 0.36)
key(keyo, "rotation_euler", 116)
keyo.rotation_euler = (math.radians(90), 0, ang + math.pi); key(keyo, "rotation_euler", 134)
key(keyo, "location", 134, keyhole_world + DN * 0.36)
for ch in keyo.children:
    ch.hide_render = False; ch.keyframe_insert("hide_render", frame=141)
    ch.hide_render = True; ch.keyframe_insert("hide_render", frame=142)

hinge.keyframe_insert("rotation_euler", frame=142)
hinge.rotation_euler = Euler((0, 0, ang + math.pi / 2 + math.radians(110))); hinge.keyframe_insert("rotation_euler", frame=172)

sp = [SUG0, Vector((-1.2, -1.3, 0.31)), Vector((-0.5, -1.15, 0.31)), Vector((door_center.x + DN.x * 0.7, door_center.y + DN.y * 0.7, 0.31)), Vector((door_center.x, door_center.y, 0.31))]
fr = [150, 166, 182, 198, 210]
for v, f in zip(sp, fr):
    sug.location = v; sug.keyframe_insert("location", frame=f)
for f in range(150, 200, 8):
    sug.location.z = 0.31; sug.keyframe_insert("location", frame=f, index=2)
    sug.location.z = 0.7; sug.keyframe_insert("location", frame=f + 4, index=2)
sug.scale = (1, 1, 1); sug.keyframe_insert("scale", frame=202)
sug.scale = (0.05, 0.05, 0.05); sug.keyframe_insert("scale", frame=212)

for f in range(1, END, 24):
    cell.scale = (1, 1, 1); cell.keyframe_insert("scale", frame=f)
    cell.scale = (1.015, 1.015, 0.985); cell.keyframe_insert("scale", frame=f + 12)
blink(eyes_c, [30, 110, 190]); blink(eyes_d, [20, 100, 175]); blink(eyes_s, [45, 165])
talk(mouth_d, 98, 116); talk(mouth_c, 176, 204)
for o in (dog, keyo, hinge, sug, head):
    smooth_fcurves(o)

# ---------------------------------------------------------------- caméra
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 28
cam.data.dof.use_dof = True
cam.data.dof.aperture_fstop = 4.0
focus = bpy.data.objects.new("Focus", None); sc.collection.objects.link(focus)
cam.data.dof.focus_object = focus
def campose(f, loc, look, foc):
    cam.location = loc
    d = Vector(look) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.keyframe_insert("location", frame=f); cam.keyframe_insert("rotation_euler", frame=f)
    focus.location = foc; focus.keyframe_insert("location", frame=f)
mid = (start + stand) / 2
campose(1, (-1.2, -8.2, 2.1), (-0.6, -0.4, 1.1), (start.x, start.y, 0.8))
campose(84, (-0.6, -6.6, 1.7), (0.1, 0.0, 1.0), (stand.x, stand.y, 0.9))
campose(110, (-0.3, -3.6, 1.05), (door_center.x, door_center.y, 0.85), door_center)
campose(140, (-0.3, -3.4, 1.0), (door_center.x, door_center.y, 0.85), door_center)
campose(176, (-0.6, -5.2, 1.4), (0.4, 0.4, 1.0), door_center)
campose(END, (-1.0, -6.2, 1.7), (0.5, 0.6, 1.1), (0.6, 0.6, 1.1))
smooth_fcurves(cam); smooth_fcurves(focus)

# ---------------------------------------------------------------- rendu
os.makedirs(OUT, exist_ok=True)
if ANIM:
    sc.render.image_settings.file_format = "FFMPEG"
    sc.render.ffmpeg.format = "MPEG4"
    sc.render.ffmpeg.codec = "H264"
    sc.render.ffmpeg.constant_rate_factor = "HIGH"
    sc.render.filepath = os.path.join(OUT, "villa_prototype_")
    print("Rendu de", END, "images en", RES, "->", OUT)
    bpy.ops.render.render(animation=True)
    print("TERMINÉ : la vidéo est dans", OUT)
    sys.exit(0)
for f in FRAMES:
    sc.frame_set(f)
    sc.render.filepath = os.path.join(OUT, f"f{f:04d}.png")
    bpy.ops.render.render(write_still=True)
print("rendu terminé", FRAMES)
