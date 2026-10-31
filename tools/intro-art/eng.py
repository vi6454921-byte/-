# AEGIS v25 · движок 2D-иллюстраций оружия: детали в миллиметрах (x — от затыльника к дулу, y — вверх от оси канала)
import math, random
F = lambda v: ('%.2f' % v).rstrip('0').rstrip('.')
MAT = {
    # base, highlight, mid, dark, bounce, outline
    'blued':  ('#222428', '#7d838d', '#2e3136', '#0f1012', '#1f2127', '#060708'),
    'steel':  ('#33363b', '#9298a0', '#42454c', '#17181b', '#2a2c32', '#09090b'),
    'park':   ('#2b2d28', '#6c7067', '#353831', '#121310', '#252722', '#080807'),
    'poly':   ('#1b1b1d', '#5b5c62', '#242528', '#0b0b0c', '#18191c', '#050506'),
    'ink':    ('#17181a', '#61656d', '#202225', '#09090a', '#15161a', '#040405'),
    'plum':   ('#242022', '#5b5254', '#2d282a', '#0f0d0e', '#1d191b', '#060505'),
    'rubber': ('#1e1e1f', '#47474a', '#262628', '#0c0c0d', '#18181a', '#050505'),
    'fde':    ('#998563', '#d2c29f', '#a69373', '#5e4f38', '#87765a', '#2a2318'),
    'fdeDk':  ('#7f6e50', '#b6a582', '#8a795a', '#4b3f2c', '#6f6047', '#221c13'),
    'alu':    ('#1f2023', '#6b6f78', '#2a2b2f', '#0e0f10', '#1c1d21', '#060607'),
    'wood':   ('#6e2a12', '#b9693c', '#7d3418', '#331006', '#5a2210', '#170703'),
    'woodL':  ('#7a3315', '#c27244', '#8a3d1b', '#3a1407', '#652812', '#1a0803'),
    'walnut': ('#5f3a22', '#a8774e', '#6c442a', '#2b170b', '#523220', '#120904'),
    'brass':  ('#9a7a3a', '#f0d68a', '#b08d45', '#5a4419', '#8a6d33', '#2a1f08'),
    'glass':  ('#1d2a33', '#9fc3d6', '#2a3d4a', '#0c1217', '#1a262e', '#050708'),
}
class Art:
    def __init__(s, L, H, px_per_mm, top_mm, left_mm=0, pad=40):
        s.L, s.H, s.k = L, H, px_per_mm
        s.top, s.left, s.pad = top_mm, left_mm, pad
        s.W = int(round((L - left_mm) * px_per_mm + 2 * pad)); s.Hpx = int(round(H * px_per_mm + 2 * pad))
        s.defs, s.body, s.n, s.under = [], [], 0, []
        s.rng = random.Random(7)
    def X(s, x): return s.pad + (x - s.left) * s.k
    def Y(s, y): return s.pad + (s.top - y) * s.k
    def id(s, p='i'): s.n += 1; return '%s%d' % (p, s.n)
    # ---------------------------------------------------------- пути
    def poly(s, pts, r=0.0, closed=True):
        """точки (x,y) или (x,y,r): углы скругляются радиусом r (мм)"""
        P = [(p[0], p[1], p[2] if len(p) > 2 else r) for p in pts]
        n = len(P); out = []
        for i in range(n):
            x, y, rr = P[i]
            if (not closed and (i == 0 or i == n - 1)) or rr <= 0:
                out.append(('L', x, y)); continue
            ax, ay = P[i - 1][0], P[i - 1][1]; bx, by = P[(i + 1) % n][0], P[(i + 1) % n][1]
            da = math.hypot(ax - x, ay - y); db = math.hypot(bx - x, by - y)
            c = min(rr, da * 0.5, db * 0.5)
            p1 = (x + (ax - x) * c / max(da, 1e-9), y + (ay - y) * c / max(da, 1e-9))
            p2 = (x + (bx - x) * c / max(db, 1e-9), y + (by - y) * c / max(db, 1e-9))
            out.append(('L', p1[0], p1[1])); out.append(('Q', x, y, p2[0], p2[1]))
        d = []
        for j, o in enumerate(out):
            if o[0] == 'L': d.append(('M' if j == 0 else 'L') + F(s.X(o[1])) + ',' + F(s.Y(o[2])))
            else: d.append('Q' + F(s.X(o[1])) + ',' + F(s.Y(o[2])) + ' ' + F(s.X(o[3])) + ',' + F(s.Y(o[4])))
        return ' '.join(d) + (' Z' if closed else '')
    def spline(s, pts, closed=True, t=0.5):
        """Катмулл-Ром через точки"""
        P = pts; n = len(P); d = ['M' + F(s.X(P[0][0])) + ',' + F(s.Y(P[0][1]))]
        rng = range(n if closed else n - 1)
        for i in rng:
            p0 = P[i - 1] if (closed or i > 0) else P[i]; p1 = P[i]; p2 = P[(i + 1) % n]
            p3 = P[(i + 2) % n] if (closed or i + 2 < n) else P[(i + 1) % n]
            c1 = (p1[0] + (p2[0] - p0[0]) * t / 3, p1[1] + (p2[1] - p0[1]) * t / 3)
            c2 = (p2[0] - (p3[0] - p1[0]) * t / 3, p2[1] - (p3[1] - p1[1]) * t / 3)
            d.append('C' + ' '.join(F(s.X(a)) + ',' + F(s.Y(b)) for a, b in (c1, c2, p2[:2])))
        return ' '.join(d) + (' Z' if closed else '')
    def rect(s, x0, y0, x1, y1, r=0): return s.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], r)
    def circ(s, x, y, r):
        return 'M%s,%s a%s,%s 0 1,0 %s,0 a%s,%s 0 1,0 %s,0 Z' % (F(s.X(x - r)), F(s.Y(y)), F(r * s.k), F(r * s.k), F(2 * r * s.k), F(r * s.k), F(r * s.k), F(-2 * r * s.k))
    def ell(s, x, y, rx, ry):
        return 'M%s,%s a%s,%s 0 1,0 %s,0 a%s,%s 0 1,0 %s,0 Z' % (F(s.X(x - rx)), F(s.Y(y)), F(rx * s.k), F(ry * s.k), F(2 * rx * s.k), F(rx * s.k), F(ry * s.k), F(-2 * rx * s.k))
    # ---------------------------------------------------------- материалы
    def grad(s, y_top, y_bot, stops, x=None):
        g = s.id('g')
        if x is None: x1, y1, x2, y2 = 0, s.Y(y_top), 0, s.Y(y_bot)
        else: x1, y1, x2, y2 = x[0], x[1], x[2], x[3]
        st = ''.join('<stop offset="%s" stop-color="%s"%s/>' % (F(o), c, (' stop-opacity="%s"' % F(a)) if a < 1 else '') for o, c, a in stops)
        s.defs.append('<linearGradient id="%s" gradientUnits="userSpaceOnUse" x1="%s" y1="%s" x2="%s" y2="%s">%s</linearGradient>' % (g, F(x1), F(y1), F(x2), F(y2), st))
        return g
    def clip(s, d, eo=False):
        c = s.id('c'); s.defs.append('<clipPath id="%s"><path d="%s"%s/></clipPath>' % (c, d, ' clip-rule="evenodd"' if eo else '')); return c
    def part(s, d, mat, y_top, y_bot, kind='flat', shade=True, rim=1.0, sheen=1.0, noise=None, under=True, extra=None, opacity=1, outline=1.0, shadow=1.0, wear=0.0, eo=False):
        """деталь: заливка по материалу с объёмом, фаска-блик по контуру, контур, тень на нижележащие"""
        b, hl, mid, dk, bo, ol = MAT[mat] if isinstance(mat, str) else mat
        if shadow and s.under:
            cid = s.id('u'); s.defs.append('<clipPath id="%s">%s</clipPath>' % (cid, ''.join(('<path d="%s" clip-rule="evenodd"/>' % u[0]) if isinstance(u, tuple) else ('<path d="%s"/>' % u) for u in s.under[-40:])))
            s.body.append('<g clip-path="url(#%s)"><path d="%s" fill="#000" opacity="%s" filter="url(#blur2)" transform="translate(%s,%s)"/></g>' % (cid, d, F(0.55 * shadow), F(0.5 * s.k), F(1.6 * s.k)))
        if kind == 'cyl':      # цилиндр: блик в верхней трети
            st = [(0, dk, 1), (0.12, mid, 1), (0.3, hl, 1), (0.42, mid, 1), (0.7, b, 1), (0.9, dk, 1), (1, bo, 1)]
        elif kind == 'round':  # скруглённая (ложа, рукоять)
            st = [(0, mid, 1), (0.08, hl, 1), (0.28, mid, 1), (0.6, b, 1), (0.88, dk, 1), (1, bo, 1)]
        else:                  # плоская стенка: мягкий вертикальный перелив
            st = [(0, hl, 1), (0.04, mid, 1), (0.14, mid, 1), (0.3, b, 1), (0.62, b, 1), (0.88, dk, 1), (0.97, dk, 1), (1, bo, 1)]
        g = s.grad(y_top, y_bot, st)
        s.body.append('<path d="%s" fill="url(#%s)"%s%s/>' % (d, g, (' opacity="%s"' % F(opacity)) if opacity < 1 else '', ' fill-rule="evenodd"' if eo else ''))
        cid = s.clip(d, eo)
        if sheen and kind == 'flat':   # диагональный отсвет по плоскости
            g2 = s.grad(0, 0, [(0, '#ffffff', 0), (0.5, '#ffffff', 0.07 * sheen), (1, '#ffffff', 0)], x=(s.X(0), s.Y(y_top), s.X(s.L * 0.6), s.Y(y_bot - 200)))
            s.body.append('<g clip-path="url(#%s)"><path d="%s" fill="url(#%s)"/></g>' % (cid, d, g2))
        if sheen and kind in ('flat', 'round'):   # отражение «софтбокса» сверху
            g4 = s.grad(y_top, y_bot, [(0, '#ffffff', 0), (0.08, '#ffffff', 0.15 * sheen), (0.2, '#ffffff', 0.035), (0.8, '#9fb6d0', 0), (0.95, '#9fb6d0', 0.06 * sheen), (1, '#9fb6d0', 0)])
            s.body.append('<g clip-path="url(#%s)"><path d="%s" fill="url(#%s)"/></g>' % (cid, d, g4))
        if noise:
            s.body.append('<g clip-path="url(#%s)"><path d="%s" fill="#000" filter="url(#%s)" opacity="%s"/></g>' % (cid, d, noise[0], F(noise[1])))
        if extra: extra(cid)
        if rim:   # фаска: светлая сверху, тёмная снизу, половина толщины внутри детали
            g3 = s.grad(y_top, y_bot, [(0, '#ffffff', 0.70 * rim), (0.3, '#ffffff', 0.16 * rim), (0.7, '#000000', 0.18), (1, '#000000', 0.5)])
            s.body.append('<g clip-path="url(#%s)"><path d="%s" fill="none" stroke="url(#%s)" stroke-width="%s" stroke-linejoin="round"/></g>' % (cid, d, g3, F(1.5 * s.k)))
        if wear and mat in ('blued', 'steel', 'park', 'alu', 'fde', 'fdeDk'):   # потёртости кромок: светлые штрихи вдоль контура
            R = s.rng; da = ' '.join(F(R.uniform(2, 14) * s.k * (0.25 if i % 2 == 0 else 1.6)) for i in range(16))
            s.body.append('<g clip-path="url(#%s)"><path d="%s" fill="none" stroke="#e8edf2" stroke-opacity="%s" stroke-width="%s" stroke-dasharray="%s" stroke-linejoin="round"/></g>' % (cid, d, F(0.30 * wear), F(0.9 * s.k), da))
        if outline: s.body.append('<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linejoin="round"/>' % (d, ol, F(0.85 * outline), F(0.32 * s.k)))
        if under: s.under.append((d, eo) if eo else d)
        return cid
    def line(s, pts, w=0.4, c='#000', o=0.6, cap='round'):
        d = 'M' + ' L'.join(F(s.X(x)) + ',' + F(s.Y(y)) for x, y in pts)
        s.body.append('<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="%s" stroke-linejoin="round"/>' % (d, c, F(o), F(w * s.k), cap))
    def groove(s, pts, w=0.5, o=0.7):
        """гравированная линия: тёмная + светлая под ней"""
        s.line([(x, y - 0.35) for x, y in pts], w * 0.8, '#ffffff', 0.12 * o)
        s.line(pts, w, '#000', o)
    def fill(s, d, c, o=1.0, clip=None, filt=None, blend=None):
        a = ''
        if filt: a += ' filter="url(#%s)"' % filt
        if blend: a += ' style="mix-blend-mode:%s"' % blend
        e = '<path d="%s" fill="%s" opacity="%s"%s/>' % (d, c, F(o), a)
        if clip: e = '<g clip-path="url(#%s)">%s</g>' % (clip, e)
        s.body.append(e)
    def hole(s, d, depth=1.0):
        """отверстие/прорезь: тёмная заливка с внутренней тенью сверху"""
        cid = s.clip(d)
        s.body.append('<path d="%s" fill="#060607"/>' % d)
        s.body.append('<g clip-path="url(#%s)"><path d="%s" fill="none" stroke="#000" stroke-width="%s" opacity=".8" transform="translate(0,%s)"/></g>' % (cid, d, F(1.6 * s.k), F(0.8 * s.k)))
        s.body.append('<path d="%s" fill="none" stroke="#ffffff" stroke-opacity=".10" stroke-width="%s" transform="translate(0,%s)"/>' % (d, F(0.3 * s.k), F(0.35 * s.k)))
    def pin(s, x, y, r=1.6, mat='steel', slot=None):
        b, hl, mid, dk, bo, ol = MAT[mat]
        g = s.id('r')
        s.defs.append('<radialGradient id="%s" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="%s"/><stop offset="0.45" stop-color="%s"/><stop offset="1" stop-color="%s"/></radialGradient>' % (g, hl, b, dk))
        s.body.append('<path d="%s" fill="url(#%s)" stroke="%s" stroke-width="%s" stroke-opacity=".9"/>' % (s.circ(x, y, r), g, ol, F(0.25 * s.k)))
        if slot is not None:
            a = math.radians(slot); dx, dy = math.cos(a) * r * 0.8, math.sin(a) * r * 0.8
            s.line([(x - dx, y - dy), (x + dx, y + dy)], r * 0.28, '#000', 0.8)
    def wood_grain(s, cid, x0, x1, y0, y1, ang=0.0, dens=1.0, col='#2a0f05', o=0.28, seed=1):
        R = random.Random(seed); n = int(70 * dens)
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; Lh = (x1 - x0) * 0.75 + 40; Hh = (y1 - y0) * 0.8 + 30
        out = []
        for i in range(n):
            v = -Hh + 2 * Hh * (i + R.random() * 0.8) / n
            ph, amp, fr = R.random() * 6.3, 0.6 + R.random() * 2.2, 0.006 + R.random() * 0.02
            pts = []
            for j in range(41):
                u = -Lh + 2 * Lh * j / 40
                vv = v + amp * math.sin(u * fr * 6.28 + ph) + 1.5 * math.sin(u * 0.0031 * 6.28 + ph * 0.5)
                pts.append((cx + u * ca - vv * sa, cy + u * sa + vv * ca))
            w = 0.18 + R.random() ** 3 * 1.2; oo = o * (0.25 + R.random() * 0.9)
            out.append('<path d="M%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (' L'.join(F(s.X(a)) + ',' + F(s.Y(b)) for a, b in pts), col, F(oo), F(w * s.k)))
        s.body.append('<g clip-path="url(#%s)">%s</g>' % (cid, ''.join(out)))
    def checker(s, cid, x0, y0, x1, y1, step=2.2, ang=50, o=0.35):
        out = []
        for a in (ang, -ang):
            ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
            Lh = math.hypot(x1 - x0, y1 - y0); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            n = int(Lh / step) + 2
            for i in range(-n, n):
                v = i * step
                p = [(cx - Lh * ca - v * sa, cy - Lh * sa + v * ca), (cx + Lh * ca - v * sa, cy + Lh * sa + v * ca)]
                out.append('<path d="M%s,%s L%s,%s" stroke="#000" stroke-opacity="%s" stroke-width="%s"/>' % (F(s.X(p[0][0])), F(s.Y(p[0][1])), F(s.X(p[1][0])), F(s.Y(p[1][1])), F(o), F(0.45 * s.k)))
        s.body.append('<g clip-path="url(#%s)">%s</g>' % (cid, ''.join(out)))
    def svg(s, ground=True, sil_extra='', drop=True):
        k = s.k
        flt = ('<filter id="blur2" x="-20%%" y="-20%%" width="140%%" height="140%%"><feGaussianBlur stdDeviation="%s"/></filter>' % F(1.1 * k) +
               '<filter id="nz" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.05"/></filter>' +
               '<filter id="nzw" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves="3" seed="8"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.25"/></filter>' +
               '<filter id="dsh" x="-5%%" y="-20%%" width="110%%" height="160%%"><feGaussianBlur stdDeviation="%s"/></filter>' % F(5 * k) + '<filter id="gsh" x="-10%%" y="-200%%" width="120%%" height="500%%"><feGaussianBlur stdDeviation="%s %s"/></filter>' % (F(9 * k), F(3.2 * k)))
        gr = ''
        if drop and s.under:   # мягкая тень под оружием (вшита в картинку — в браузере фильтров нет)
            gr += '<g filter="url(#dsh)" opacity=".5" transform="translate(0,%s)">%s</g>' % (F(7 * k), ''.join('<path d="%s" fill="#000"%s/>' % ((u[0], ' fill-rule="evenodd"') if isinstance(u, tuple) else (u, '')) for u in s.under))
        if ground and s.under:
            # тень на «стол»: силуэт, сплющенный и размытый, под оружием
            gr = '<g filter="url(#gsh)" opacity=".75"><g transform="translate(0,%s) scale(1,0.10)">%s</g></g>' % (F(s.Hpx * 0.86), ''.join('<path d="%s" fill="#000"/>' % (u[0] if isinstance(u, tuple) else u) for u in s.under))
        sil = ''.join('<path d="%s"%s/>' % ((u[0], ' clip-rule="evenodd"') if isinstance(u, tuple) else (u, '')) for u in s.under)
        fin = ('<clipPath id="silc">%s</clipPath><radialGradient id="fall" cx="0.46" cy="0.32" r="0.62" gradientTransform="translate(0.46 0.32) scale(1 2.2) translate(-0.46 -0.32)">'
               '<stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient>' % sil)
        s.defs.append(fin)
        s.body.append('<g clip-path="url(#silc)"><rect x="0" y="0" width="%d" height="%d" fill="url(#fall)"/></g>' % (s.W, s.Hpx))
        return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d"><defs>%s%s</defs>%s%s%s</svg>' %
                (s.W, s.Hpx, s.W, s.Hpx, flt, ''.join(s.defs), gr, ''.join(s.body), sil_extra))
