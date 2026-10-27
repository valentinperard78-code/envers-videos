"""La Villa des Pathologies — prototype Blender (4.2).
blender -b -P scene.py -- <out_dir> <frame> [<frame> ...]   (rend les images demandées)
Scène : soir dans la villa ; le chien Insuline marche jusqu'à Cellia (la cellule),
glisse la clé dans la serrure, la tourne, la porte s'ouvre et Sucrette (glucose) entre."""
import bpy, bmesh, math, sys, os, random
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
FRAMES = [int(x) for x in argv[1:]] or [1]
RES = (int(os.environ.get("RES_X", 720)), int(os.environ.get("RES_Y", 1280)))
SAMPLES = int(os.environ.get("SAMPLES", 48))
FPS = 24
END = 216            # 9 s

random.seed(3)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
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
    sc.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
sc.render.image_settings.file_format = "PNG"
sc.render.film_transparent = False
sc.render.use_persistent_data = True


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
sky.sun_elevation = math.radians(4)
sky.sun_rotation = math.radians(200)
sky.air_density = 1.4
sky.dust_density = 2.5
bg = wn.nodes["Background"]
bg.inputs["Strength"].default_value = 0.55
wn.links.new(sky.outputs["Color"], bg.inputs["Color"])

sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sc.collection.objects.link(sun)
sun.data.energy = 2.2
sun.data.color = (1.0, 0.62, 0.38)
sun.data.angle = math.radians(3)
sun.rotation_euler = Euler((math.radians(80), 0, math.radians(200)))

fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "AREA"))
sc.collection.objects.link(fill)
fill.data.energy = 900
fill.data.size = 6
fill.data.color = (0.75, 0.8, 1.0)
fill.location = (2.5, -6.5, 4.5)
fill.rotation_euler = Euler((math.radians(55), 0, math.radians(20)))

# ---------------------------------------------------------------- décor : la villa
M_TILE = mat("Dallage", (0.62, 0.55, 0.47), rough=0.55, bump=(18, 0.25))
M_WALL = mat("Enduit", (0.93, 0.9, 0.85), rough=0.8, bump=(6, 0.08))
M_WIN = mat("Fenetre", (1.0, 0.75, 0.45), emit=(1.0, 0.68, 0.38), emit_s=6)
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
    for k in range(9):
        a = k / 9 * 2 * math.pi
        l = obj_from(bpy.ops.mesh.primitive_plane_add, "Palme", M_LEAF, size=1, location=top)
        l.scale = (2.4, 0.35, 1)
        l.rotation_euler = (0, math.radians(25), a)
        l.location = top + Vector((math.cos(a) * 1.1, math.sin(a) * 1.1, -0.35))
        sb = l.modifiers.new("b", "SIMPLE_DEFORM"); sb.deform_method = "BEND"; sb.angle = math.radians(-50); sb.deform_axis = "Y"
palm(-6.5, 6.5, 6.5, 0.12)
palm(8.0, 7.5, 7.5, -0.15)
palm(-9.5, 9.0, 5.5, 0.05)

# ---------------------------------------------------------------- personnages
def face(par, center, fwd, r_eye, spacing, mouth_w, mood="happy", eye_up=0.0):
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
                 location=Vector(center) - Vector((0, 0, r_eye * 2.2)) + fwd * r_eye * 0.1, major_segments=32, minor_segments=12)
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


# --- Cellia (la cellule) : grosse sphère violette translucide avec noyau
M_CELL = mat("Cellule", (0.55, 0.32, 0.85), rough=0.25, sss=0.6, sss_col=(0.9, 0.5, 1.0), coat=0.6, bump=(4, 0.12))
cell = sphere("Cellia", 1.35, (1.6, 0.8, 1.35), M_CELL, seg=64)
dis = cell.modifiers.new("d", "DISPLACE")
dis.texture = bpy.data.textures.new("tc", "CLOUDS"); dis.texture.noise_scale = 0.9; dis.strength = 0.12
subsurf(cell, 1)
nuc = sphere("Noyau", 0.45, (2.05, 1.1, 1.95), mat("Noyau", (0.35, 0.12, 0.6), rough=0.4, sss=0.5), seg=32)
parent(nuc, cell)
CELL_FWD = Vector((-0.75, -0.66, 0))
eyes_c, mouth_c = face(cell, Vector((1.6, 0.8, 1.35)) + CELL_FWD * 1.22 + Vector((0, 0, 0.45)), CELL_FWD, 0.2, 0.32, 0.16)
# porte de la cellule (sur le flanc gauche, face caméra)
door_center = Vector((1.6, 0.8, 1.0)) + Vector((-1.0, -0.45, 0)).normalized() * 1.28
frame_o = obj_from(bpy.ops.mesh.primitive_cylinder_add, "Encadrement", mat("Encadr", (0.22, 0.08, 0.2), rough=0.6), radius=0.42, depth=0.12, location=door_center, vertices=40)
ang = math.atan2(-0.45, -1.0)
frame_o.rotation_euler = Euler((math.radians(90), 0, ang + math.pi / 2))
frame_o.scale = (0.8, 1.35, 1)
parent(frame_o, cell)
# charnière (pivot) à gauche de la porte
side_vec = Vector((math.cos(ang + math.pi / 2), math.sin(ang + math.pi / 2), 0))
hinge = bpy.data.objects.new("Charniere", None); sc.collection.objects.link(hinge)
hinge.location = door_center - side_vec * 0.32 + Vector((math.cos(ang), math.sin(ang), 0)) * 0.08
hinge.rotation_euler = Euler((0, 0, ang + math.pi / 2))
door = obj_from(bpy.ops.mesh.primitive_cube_add, "Porte", M_WOOD, size=1, location=door_center + Vector((math.cos(ang), math.sin(ang), 0)) * 0.08)
door.scale = (0.62, 0.07, 1.05)
door.rotation_euler = Euler((0, 0, ang + math.pi / 2))
bv = door.modifiers.new("bv", "BEVEL"); bv.width = 0.05; bv.segments = 4
parent(door, hinge)
M_GOLD = mat("Or", (1.0, 0.75, 0.25), rough=0.2, metal=1.0)
lock = obj_from(bpy.ops.mesh.primitive_cylinder_add, "Serrure", M_GOLD, radius=0.06, depth=0.04, location=door_center + Vector((math.cos(ang), math.sin(ang), 0)) * 0.13 + side_vec * 0.18, vertices=24)
lock.rotation_euler = Euler((math.radians(90), 0, ang + math.pi / 2))
parent(lock, door)
keyhole_world = lock.location.copy() + Vector((math.cos(ang), math.sin(ang), 0)) * 0.03

# --- Insuline (le chien) : corps de primitives arrondies, pelage doré
M_FUR = mat("Pelage", (0.85, 0.55, 0.2), rough=0.7, sss=0.15, bump=(60, 0.35))
M_FUR2 = mat("Pelage2", (0.98, 0.88, 0.7), rough=0.7, bump=(60, 0.3))
M_NOSE = mat("Truffe", (0.03, 0.02, 0.02), rough=0.15, coat=1)
M_COLLAR = mat("Collier", (0.85, 0.05, 0.12), rough=0.35)
dog = bpy.data.objects.new("Chien", None); sc.collection.objects.link(dog)
dog.location = (-3.2, -1.6, 0)
torso = sphere("Torse", 0.38, (0, 0, 0.62), M_FUR); torso.scale = (1.35, 0.85, 0.85); parent(torso, dog)
head = sphere("Tete", 0.32, (0.52, 0, 1.02), M_FUR); parent(head, dog)
snout = sphere("Museau", 0.17, (0.8, 0, 0.94), M_FUR2); snout.scale = (1.2, 1, 0.8); parent(snout, head)
nose = sphere("Truffe", 0.07, (0.98, 0, 0.99), M_NOSE); parent(nose, head)
for s in (-1, 1):
    ear = sphere("Oreille", 0.16, (0.42, s * 0.3, 1.12), mat("Oreille", (0.55, 0.32, 0.12), rough=0.7)); ear.scale = (0.6, 0.35, 1.25)
    ear.rotation_euler = (s * 0.35, 0, 0); parent(ear, head)
eyes_d, mouth_d = face(head, (0.78, 0, 1.15), (1, 0, 0), 0.075, 0.12, 0.07)
collar = obj_from(bpy.ops.mesh.primitive_torus_add, "Collier", M_COLLAR, major_radius=0.25, minor_radius=0.045, location=(0.38, 0, 0.82))
collar.rotation_euler = (0, math.radians(65), 0); parent(collar, dog)
legs = []
for (lx, ly) in ((0.32, 0.2), (0.32, -0.2), (-0.32, 0.2), (-0.32, -0.2)):
    piv = bpy.data.objects.new("Hanche", None); sc.collection.objects.link(piv)
    piv.location = (lx, ly, 0.5); parent(piv, dog)
    leg = obj_from(bpy.ops.mesh.primitive_cylinder_add, "Patte", M_FUR, radius=0.085, depth=0.48, location=(lx, ly, 0.27), vertices=20)
    paw = sphere("Pied", 0.1, (lx + 0.04, ly, 0.05), M_FUR2); paw.scale = (1.3, 1, 0.6)
    parent(leg, piv); parent(paw, piv)
    legs.append(piv)
tail = obj_from(bpy.ops.mesh.primitive_cone_add, "Queue", M_FUR, radius1=0.07, radius2=0.02, depth=0.45, location=(-0.6, 0, 0.88), vertices=16)
tail.rotation_euler = (0, math.radians(-55), 0)
tpiv = bpy.data.objects.new("QueuePiv", None); sc.collection.objects.link(tpiv); tpiv.location = (-0.48, 0, 0.75); parent(tpiv, dog)
parent(tail, tpiv)

# clé (portée par le chien dans la gueule, puis dans la serrure)
keyo = bpy.data.objects.new("Cle", None); sc.collection.objects.link(keyo)
ring = obj_from(bpy.ops.mesh.primitive_torus_add, "Anneau", M_GOLD, major_radius=0.09, minor_radius=0.025, location=(0, 0, 0))
ring.rotation_euler = (math.radians(90), 0, 0); parent(ring, keyo)
shaft = obj_from(bpy.ops.mesh.primitive_cylinder_add, "Tige", M_GOLD, radius=0.022, depth=0.26, location=(0.22, 0, 0))
shaft.rotation_euler = (0, math.radians(90), 0); parent(shaft, keyo)
bit = obj_from(bpy.ops.mesh.primitive_cube_add, "Panneton", M_GOLD, size=1, location=(0.32, 0, -0.05)); bit.scale = (0.05, 0.02, 0.08); parent(bit, keyo)

# --- Sucrette (glucose) : cube de sucre arrondi, grains et brillance
M_SUGAR = mat("Sucre", (0.97, 0.96, 0.98), rough=0.55, sss=0.35, sss_col=(1, 1, 1), bump=(140, 0.6))
sug = obj_from(bpy.ops.mesh.primitive_cube_add, "Sucrette", M_SUGAR, size=0.62, location=(-2.2, 0.6, 0.31))
bvs = sug.modifiers.new("bv", "BEVEL"); bvs.width = 0.1; bvs.segments = 5
eyes_s, mouth_s = face(sug, (-2.2 + 0.0, 0.6 - 0.32, 0.4), (0, -1, 0), 0.07, 0.12, 0.06)

# ---------------------------------------------------------------- animation
# Chien : marche de x=-3.2 à x=-0.35 (devant la porte), de f1 à f84
start, stop = Vector((-3.4, -1.7, 0)), Vector((-0.55, -0.75, 0))
dog.rotation_euler = (0, 0, math.atan2((stop - start).y, (stop - start).x))
key(dog, "location", 1, start); key(dog, "location", 84, stop)
for f in range(1, 85, 6):  # pas : balancement des pattes + rebond
    for i, piv in enumerate(legs):
        ph = 1 if i in (0, 3) else -1
        piv.rotation_euler = (0, ph * 0.45 * (1 if (f // 6) % 2 == 0 else -1), 0); piv.keyframe_insert("rotation_euler", frame=f)
    dog.keyframe_insert("location", frame=f) if False else None
    torso.location = (0, 0, 0.62 + (0.03 if (f // 6) % 2 == 0 else 0)); torso.keyframe_insert("location", frame=f)
for piv in legs:
    piv.rotation_euler = (0, 0, 0); piv.keyframe_insert("rotation_euler", frame=90)
for f in range(1, END, 5):  # queue qui remue
    tpiv.rotation_euler = (0, 0, 0.5 * (1 if (f // 5) % 2 == 0 else -1)); tpiv.keyframe_insert("rotation_euler", frame=f)
# tête qui se lève vers la serrure puis revient
head.rotation_euler = (0, 0, 0); head.keyframe_insert("rotation_euler", frame=84)
head.rotation_euler = (0, -0.25, 0.25); head.keyframe_insert("rotation_euler", frame=100)
head.rotation_euler = (0, -0.25, 0.25); head.keyframe_insert("rotation_euler", frame=150)
head.rotation_euler = (0, 0.1, 0.4); head.keyframe_insert("rotation_euler", frame=165)

# Clé : suit la gueule du chien, puis va dans la serrure (f100-120), tourne (f120-136), reste
dir_v = (stop - start).normalized()
def mouth_pos(base):
    return base + dir_v * 0.95 + Vector((0, 0, 0.88))
key(keyo, "location", 1, mouth_pos(start)); key(keyo, "location", 84, mouth_pos(stop))
keyo.rotation_euler = Euler((0, 0, dog.rotation_euler.z)); keyo.keyframe_insert("rotation_euler", frame=84)
key(keyo, "location", 100, keyhole_world - Vector((math.cos(ang), math.sin(ang), 0)) * 0.42)
keyo.rotation_euler = Euler((0, 0, ang + math.pi)); keyo.keyframe_insert("rotation_euler", frame=100)
key(keyo, "location", 118, keyhole_world - Vector((math.cos(ang), math.sin(ang), 0)) * 0.26)
keyo.rotation_euler = Euler((0, 0, ang + math.pi)); keyo.keyframe_insert("rotation_euler", frame=120)
keyo.rotation_euler = Euler((math.radians(90), 0, ang + math.pi)); keyo.keyframe_insert("rotation_euler", frame=136)
# la clé repart avec la porte
key(keyo, "location", 136, keyhole_world - Vector((math.cos(ang), math.sin(ang), 0)) * 0.26)

# Porte : s'ouvre f140-170 (rotation autour de la charnière)
hinge.keyframe_insert("rotation_euler", frame=140)
hinge.rotation_euler = Euler((0, 0, ang + math.pi / 2 - math.radians(105))); hinge.keyframe_insert("rotation_euler", frame=170)
# la clé disparaît dans la porte qui s'ouvre (on la cache)
keyo.hide_render = False; keyo.keyframe_insert("hide_render", frame=139)
for ch in keyo.children:
    ch.hide_render = False; ch.keyframe_insert("hide_render", frame=139)
    ch.hide_render = True; ch.keyframe_insert("hide_render", frame=140)

# Sucrette : sautille vers la porte et entre (f150-210)
spath = [(-2.2, 0.6), (-1.6, 0.2), (-1.0, -0.05), (-0.45, -0.2), (door_center.x - 0.1, door_center.y - 0.1)]
fr = [1, 150, 170, 186, 206]
for i, (x, y) in enumerate(spath):
    sug.location = (x, y, 0.31); sug.keyframe_insert("location", frame=fr[i])
for f in range(150, 206, 10):
    sug.location.z = 0.31; sug.keyframe_insert("location", frame=f, index=2)
    sug.location.z = 0.65; sug.keyframe_insert("location", frame=f + 5, index=2)
sug.scale = (1, 1, 1); sug.keyframe_insert("scale", frame=200)
sug.scale = (0.05, 0.05, 0.05); sug.keyframe_insert("scale", frame=212)

# Cellia : sourire qui s'élargit et léger « souffle »
for f in range(1, END, 24):
    cell.scale = (1, 1, 1); cell.keyframe_insert("scale", frame=f)
    cell.scale = (1.02, 1.02, 0.98); cell.keyframe_insert("scale", frame=f + 12)
blink(eyes_c, [30, 110, 190]); blink(eyes_d, [20, 95, 175]); blink(eyes_s, [45, 160])
talk(mouth_d, 86, 118)       # « Wouf ! Je toque à la porte… »
talk(mouth_c, 172, 200)      # « Merci les chiens ! »
for o in (dog, keyo, hinge, sug, head):
    smooth_fcurves(o)

# ---------------------------------------------------------------- caméra
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 30
cam.data.dof.use_dof = True
cam.data.dof.aperture_fstop = 2.8
focus = bpy.data.objects.new("Focus", None); sc.collection.objects.link(focus)
cam.data.dof.focus_object = focus
def campose(f, loc, look, foc):
    cam.location = loc
    d = Vector(look) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.keyframe_insert("location", frame=f); cam.keyframe_insert("rotation_euler", frame=f)
    focus.location = foc; focus.keyframe_insert("location", frame=f)
campose(1, (-4.6, -7.2, 2.3), (-1.8, -0.6, 1.0), (-3.0, -1.6, 0.8))
campose(84, (-2.6, -5.6, 1.8), (-0.4, 0.0, 1.0), (-0.5, -0.7, 0.9))
campose(120, (-1.5, -3.3, 1.35), (0.25, 0.1, 1.0), door_center)
campose(170, (-1.9, -4.2, 1.6), (0.4, 0.2, 1.0), door_center)
campose(END, (-2.8, -5.8, 2.0), (0.5, 0.4, 1.1), (0.4, 0.3, 1.0))
smooth_fcurves(cam); smooth_fcurves(focus)

# ---------------------------------------------------------------- rendu
os.makedirs(OUT, exist_ok=True)
for f in FRAMES:
    sc.frame_set(f)
    sc.render.filepath = os.path.join(OUT, f"f{f:04d}.png")
    bpy.ops.render.render(write_still=True)
print("rendu terminé", FRAMES)
