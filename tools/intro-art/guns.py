# AEGIS v25 · иллюстрации оружия для экрана загрузки (вид справа, дуло вправо). python3 guns.py <id> [...]
import sys, math
from eng import Art, MAT
def mag_curve(A, spine, w0, w1, n=24):
    """контур изогнутого магазина: ось-сплайн spine (верх→низ), ширина w0→w1"""
    pts = []; P = spine
    def at(t):
        m = len(P) - 1; u = min(m - 1e-9, t * m); i = int(u); f = u - i
        p0, p1, p2, p3 = P[max(0, i - 1)], P[i], P[i + 1], P[min(m, i + 2)]
        def cr(a, b, c, d): return 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f ** 3)
        return (cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]))
    L, R = [], []
    for j in range(n + 1):
        t = j / n; p = at(t); q = at(min(1, t + 0.01)); r_ = at(max(0, t - 0.01))
        tx, ty = q[0] - r_[0], q[1] - r_[1]; ln = math.hypot(tx, ty) or 1; nx, ny = -ty / ln, tx / ln
        w = (w0 + (w1 - w0) * t) / 2
        L.append((p[0] - nx * w, p[1] - ny * w)); R.append((p[0] + nx * w, p[1] + ny * w))
    return L, R, at
def akm(A, v74=False):
    L = A.L
    wood = 'plum' if v74 else 'wood'
    # --- шомпол (под стволом, за цевьём)
    A.part(A.rect(600, -15.5, 832, -11), 'steel', -11, -15.5, kind='cyl', rim=0.6, under=False, shadow=0)
    # --- магазин
    if v74:
        spine = [(455, -30), (472, -95), (496, -160), (520, -218)]
        Lp, Rp, at = mag_curve(A, spine, 70, 62); mmat = 'plum'
    else:
        spine = [(457, -30), (478, -100), (510, -168), (548, -226)]
        Lp, Rp, at = mag_curve(A, spine, 74, 64); mmat = 'blued'
    body = Lp + Rp[::-1]
    dmag = A.poly(body, 3)
    mc = A.part(dmag, mmat, -30, -240, kind='flat', rim=0.9, noise=('nz', 0.10 if v74 else 0.06))
    # рёбра/«вафля»
    if v74:
        import math as M
        for off in (-14, 14):
            pts = []
            for j in range(13):
                t = 0.1 + j * 0.065; p = at(t); q = at(t + 0.01); a = M.atan2(q[1] - p[1], q[0] - p[0]) + M.pi / 2
                pts.append((p[0] + off * M.cos(a), p[1] + off * M.sin(a)))
            A.line([(x, y) for x, y in pts], 3.2, '#000', 0.25); A.line([(x - 0.8, y + 0.4) for x, y in pts], 1.0, '#fff', 0.07)
        p = at(0.06); A.groove([(p[0] - 32, p[1] + 3), (p[0] + 32, p[1] - 4)], 0.6, 0.5)
    else:
        import math as M
        for row in range(7):
            t = 0.12 + row * 0.115; p = at(t); q = at(t + 0.01)
            ang = M.degrees(M.atan2(q[1] - p[1], q[0] - p[0]))
            for col, off in enumerate((-17, 12)):
                nx, ny = -M.sin(M.radians(ang + 90)) * 0, 0
                cx = p[0] + off * M.cos(M.radians(ang + 90)); cy = p[1] + off * M.sin(M.radians(ang + 90))
                # вдавленная «вафля» — светлый верх, тёмный низ
                d = A.poly([(cx - 9, cy + 5), (cx + 9, cy + 7), (cx + 11, cy - 6), (cx - 7, cy - 8)], 2.5)
                A.fill(d, '#ffffff', 0.035, clip=mc); A.body.append('<path d="%s" fill="none" stroke="#000" stroke-opacity=".38" stroke-width="%.2f" transform="translate(0,%.2f)"/>' % (d, 0.45 * A.k, 0.35 * A.k))
                A.body.append('<path d="%s" fill="none" stroke="#fff" stroke-opacity=".10" stroke-width="%.2f" transform="translate(0,%.2f)"/>' % (d, 0.35 * A.k, -0.35 * A.k))
    # затыльник магазина
    pb = Lp[-1]; pf = Rp[-1]
    A.part(A.poly([(pb[0] - 3, pb[1] + 3), (pf[0] + 4, pf[1] + 4), (pf[0] + 3, pf[1] - 5), (pb[0] - 4, pb[1] - 6)], 2.5), 'blued' if not v74 else 'plum', pf[1] + 4, pb[1] - 6, rim=0.8)
    # --- пистолетная рукоять
    dg = A.poly([(300, -34, 2), (350, -34, 2), (345, -62, 10), (330, -140, 12), (322, -153, 6), (283, -151, 7), (277, -142, 6), (299, -56, 14)], 4)
    gmat = 'plum' if v74 else 'woodL'
    gc = A.part(dg, gmat, -34, -153, kind='round', rim=0.9)
    if not v74: A.wood_grain(gc, 270, 352, -155, -34, ang=-76, dens=0.6, o=0.22, seed=3)
    A.checker(gc, 290, -128, 334, -62, step=2.4, ang=55, o=0.28 if v74 else 0.32)
    # --- приклад
    if v74:
        ds = A.poly([(6, -6, 3), (70, -2), (168, 0, 26), (226, 6, 20), (258, 14, 3), (264, -36, 3), (238, -44), (7, -112, 6)], 2)
        sc = A.part(ds, 'plum', 14, -112, kind='round', rim=1.0, noise=('nz', 0.12))
        # облегчающий вырез приклада АК-74
        A.hole(A.poly([(58, -50), (170, -52), (176, -60), (60, -66)], 7))
        A.part(A.poly([(0, -6), (8, -6), (8, -112), (0, -113)], 2.5), 'rubber', -6, -113, rim=0.6)
    else:
        ds = A.poly([(6, -8, 3), (70, -5), (172, -2, 28), (226, 5, 22), (258, 14, 3), (264, -36, 3), (238, -44), (7, -113, 6)], 2)
        sc = A.part(ds, 'wood', 14, -113, kind='round', rim=1.0)
        A.wood_grain(sc, 0, 262, -116, 16, ang=14, dens=1.1, o=0.30, seed=5)
        A.fill(ds, '#000', 0.45, clip=sc, filt='nzw', blend='multiply')
        A.part(A.poly([(-1, -7), (7, -7), (7, -113), (-1, -114)], 2.0), 'blued', -7, -114, rim=0.7)
        A.pin(3.2, -60, 1.6, 'steel', slot=90)
    # антабка приклада
    A.line([(86, -84), (92, -93), (102, -96), (108, -90)], 1.8, '#2a2c30', 1); A.line([(86, -84.6), (92, -93.6), (102, -96.6), (108, -90.6)], 0.5, '#aab0b8', 0.5)
    # --- ствол
    A.part(A.poly([(540, -10.5), (850, -8.5), (850, 8.5), (540, 10.5)]), 'blued', 10.5, -10.5, kind='cyl', rim=0.6)
    # --- ствольная коробка
    dr = A.poly([(260, -37, 2), (262, 13, 3), (544, 14, 2), (552, 8, 2), (552, -37, 2), (498, -37), (497, -30), (419, -30), (418, -37)], 1)
    rc = A.part(dr, 'blued', 14, -37, kind='flat', rim=1.0, noise=('nz', 0.08))
    # штампованные выступы/рёбра, ниша над магазином (АКМ)
    A.groove([(268, -2), (540, -2)], 0.35, 0.35)
    if not v74: A.fill(A.ell(458, -16, 20, 6), '#000', 0.35, clip=rc, filt='blur2'); A.fill(A.ell(458, -14.5, 18, 4), '#fff', 0.05, clip=rc)
    # заклёпки вкладышей и оси УСМ
    for x, y in ((270, -10), (270, -26), (282, -18), (533, -8), (533, -26), (543, -17), (322, -16), (339, -16)):
        A.pin(x, y, 1.9, 'steel')
    A.pin(357, -22, 2.4, 'steel'); A.pin(386, -22, 2.4, 'steel')
    A.line([(357, -22), (372, -18), (386, -22)], 0.9, '#9aa0a8', 0.55)   # «пастуший посох» — пружина фиксатора осей
    # спусковая скоба, спуск, защёлка магазина
    tg = [(353, -36), (354, -64), (361, -71), (404, -71), (411, -63), (414, -36)]
    A.line(tg, 5.6, '#0a0a0b', 1); A.line(tg, 4.6, '#26282c', 1)
    A.line([(x, y + 1.2) for x, y in tg], 1.0, '#9aa0a8', 0.35)
    A.part(A.poly([(368, -36), (375, -36), (379, -52), (373, -64), (369, -62), (372, -52)], 1.2), 'steel', -36, -64, rim=0.6)
    A.part(A.poly([(412, -34), (424, -34), (428, -52), (420, -56)], 1.5), 'blued', -34, -56, rim=0.7)
    # --- крышка ствольной коробки
    dt = A.poly([(266, 12, 2), (270, 26, 8), (296, 33, 4), (522, 33, 2), (524, 12, 1)], 1)
    tc = A.part(dt, 'blued', 33, 12, kind='round', rim=1.1)
    if not v74:
        for x in range(330, 515, 28): A.groove([(x, 31), (x, 16)], 0.6, 0.35)
    else:
        for x in range(330, 515, 30): A.groove([(x, 31), (x, 18)], 0.5, 0.25)
    A.pin(276, 20, 3.6, 'steel')   # кнопка направляющей возвратной пружины
    # --- прицельная колодка и планка
    A.part(A.poly([(514, 12), (514, 28, 3), (528, 38, 3), (586, 38, 3), (592, 28, 3), (594, 10)], 1), 'blued', 38, 10, kind='round', rim=1.0)
    A.part(A.poly([(528, 38), (582, 43.5), (582, 39.5), (530, 34.5)], 1), 'steel', 44, 34, rim=0.7)
    A.part(A.rect(547, 36, 561, 45, 1.5), 'steel', 45, 36, rim=0.7)
    # --- газовая трубка, накладка, цевьё
    A.part(A.poly([(696, 13), (756, 13), (756, 31), (696, 31)]), 'blued', 31, 13, kind='cyl', rim=0.7)
    if v74:
        du = A.poly([(590, 11), (590, 30, 5), (600, 35, 6), (690, 35, 6), (700, 30, 4), (700, 11)], 1)
        uc = A.part(du, 'plum', 35, 11, kind='cyl', rim=0.9, noise=('nz', 0.12))
        dl = A.poly([(552, 9), (552, -28, 4), (566, -36, 12), (684, -35, 10), (700, -26, 4), (700, 9)], 1)
        lc = A.part(dl, 'plum', 9, -36, kind='round', rim=0.9, noise=('nz', 0.12))
        for y in (-8, -16, -24): A.groove([(566, y), (688, y)], 0.8, 0.55)
    else:
        du = A.poly([(590, 11), (590, 30, 5), (600, 35, 6), (690, 35, 6), (700, 30, 4), (700, 11)], 1)
        uc = A.part(du, 'woodL', 35, 11, kind='cyl', rim=0.9)
        A.wood_grain(uc, 588, 702, 9, 37, ang=1, dens=0.5, o=0.28, seed=9)
        dl = A.poly([(552, 9), (552, -26, 4), (566, -35, 14), (676, -36, 12), (700, -28, 4), (700, 9)], 1)
        lc = A.part(dl, 'woodL', 9, -36, kind='round', rim=0.9)
        A.wood_grain(lc, 550, 702, -38, 11, ang=-1, dens=0.7, o=0.30, seed=11)
        A.groove([(562, -14), (690, -14)], 0.6, 0.4)   # полка-упор для ладони
    # хомут цевья
    A.part(A.poly([(699, -28), (713, -28), (713, 11), (699, 11)], 2), 'blued', 11, -28, kind='flat', rim=0.8)
    A.part(A.poly([(704, -26), (710, -26), (712, -40), (706, -40)], 1.5), 'steel', -26, -40, rim=0.6)
    # --- газовая камора
    A.part(A.poly([(748, -12), (748, 33, 3), (760, 37, 4), (781, 37, 4), (790, 26, 5), (790, -4, 3), (772, -14, 3), (752, -14)], 1), 'blued', 37, -14, kind='round', rim=1.0)
    A.part(A.poly([(770, -14), (802, -14), (800, -21), (772, -21)], 1.5), 'blued', -14, -21, rim=0.7)   # штык-упор
    # --- основание мушки
    fx0, fx1 = (812, 847) if not v74 else (822, 857)
    A.part(A.poly([(fx0, -14), (fx0, 13, 2), (fx0 + 6, 16, 2), (fx0 + 8, 44, 3), (fx0 + 12, 50, 3), (fx0 + 26, 50, 3), (fx0 + 29, 44, 2), (fx1 - 2, 13, 2), (fx1, -14)], 1.2), 'blued', 50, -14, kind='round', rim=1.0)
    A.hole(A.poly([(fx0 + 12, 22), (fx0 + 25, 22), (fx0 + 25, 46), (fx0 + 12, 46)], 3))
    A.part(A.rect(fx0 + 17, 22, fx0 + 20, 40, 0.5), 'steel', 40, 22, rim=0.4, outline=0.5, shadow=0)
    A.part(A.poly([(fx0, -14), (fx1, -14), (fx1 - 4, -22), (fx0 + 3, -22)], 2), 'blued', -14, -22, rim=0.6)
    # --- дульное устройство
    if v74:
        d = A.poly([(857, -12), (943, -12), (943, 12), (857, 12)], 1.5)
        bc = A.part(d, 'blued', 12, -12, kind='cyl', rim=0.8)
        A.hole(A.rect(905, -6, 924, 6, 3))
        for x in (930, 936): A.groove([(x, 11), (x, -11)], 0.9, 0.6)
        A.groove([(872, 11.5), (872, -11.5)], 0.6, 0.5)
    else:
        d = A.poly([(847, -11), (880, -11), (868, 11), (847, 11)], 1.2)
        A.part(d, 'blued', 11, -11, kind='cyl', rim=0.8)
        A.groove([(851, 10.5), (851, -10.5)], 0.5, 0.5)
    # затворная рама в окне ствольной коробки
    A.part(A.poly([(408, 2), (520, 2), (520, 13), (408, 13)], 1), 'steel', 13, 2, kind='flat', rim=0.8)
    A.groove([(412, 7.5), (516, 7.5)], 0.4, 0.4)
    # --- предохранитель-переводчик, рукоять затвора
    A.part(A.poly([(300, -14, 3), (318, -14, 3), (320, -3), (434, 10, 3), (433, 18, 3), (304, 6, 4)], 1.5), 'steel', 18, -14, kind='flat', rim=1.0)
    A.pin(306, 1, 3.2, 'blued')
    A.part(A.poly([(470, 2), (498, 2, 3), (506, 9, 4), (500, 14, 3), (470, 12)], 1.5), 'steel', 14, 2, kind='round', rim=0.9)
    A.part(A.circ(503, 9, 5.5), 'steel', 14.5, 3.5, kind='round', rim=0.9)
def build(gid):
    if gid == 'akm':
        A = Art(880, 300, 1.85, 62, left_mm=-6, pad=34); akm(A)
    elif gid == 'ak74':
        A = Art(943, 300, 1.75, 62, left_mm=-6, pad=34); akm(A, v74=True)
    elif gid == 'm416':
        from guns2 import hk416; A = Art(880, 260, 1.9, 82, left_mm=-4, pad=34); hk416(A)
    elif gid == 'scar':
        from guns2 import scar; A = Art(965, 280, 1.75, 108, left_mm=-4, pad=34); scar(A)
    elif gid == 'mp5a3':
        from guns2 import mp5; A = Art(700, 260, 2.3, 62, left_mm=-4, pad=34); mp5(A)
    elif gid == 'm870':
        from guns2 import m870; A = Art(965, 200, 1.75, 32, left_mm=-4, pad=34); m870(A)
    elif gid == 'svd':
        from guns2 import svd; A = Art(1225, 250, 1.38, 116, left_mm=-4, pad=34); svd(A)
    return A
if __name__ == '__main__':
    for gid in sys.argv[1:]:
        A = build(gid); open('out/%s.svg' % gid, 'w').write(A.svg(ground=False))
        # габарит для подписи-размерной линии: от затыльника (x=0) до дула (x=L), в долях ширины картинки
        import json
        print(json.dumps({'id': gid, 'w': A.W, 'h': A.Hpx, 'x0': round(A.X(0) / A.W, 4), 'x1': round(A.X(A.L) / A.W, 4), 'L': A.L}))
