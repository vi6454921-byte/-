/* Bullet impacts from supplied Decals.ts; Three.js DecalGeometry (MIT). */
(function(THREE){
"use strict";
const {
	BufferGeometry,
	Float32BufferAttribute,
	Matrix4,
	Vector3
} = THREE;

/**
 * You can use this geometry to create a decal mesh, that serves different kinds of purposes.
 * e.g. adding unique details to models, performing dynamic visual environmental changes or covering seams.
 *
 * Constructor parameter:
 *
 * mesh — Any mesh object
 * position — Position of the decal projector
 * orientation — Orientation of the decal projector
 * size — Size of the decal projector
 *
 * reference: http://blog.wolfire.com/2009/06/how-to-project-decals/
 *
 */

class DecalGeometry extends BufferGeometry {

	constructor( mesh, position, orientation, size ) {

		super();

		// buffers

		const vertices = [];
		const normals = [];
		const uvs = [];

		// helpers

		const plane = new Vector3();

		// this matrix represents the transformation of the decal projector

		const projectorMatrix = new Matrix4();
		projectorMatrix.makeRotationFromEuler( orientation );
		projectorMatrix.setPosition( position );

		const projectorMatrixInverse = new Matrix4();
		projectorMatrixInverse.copy( projectorMatrix ).invert();

		// generate buffers

		generate();

		// build geometry

		this.setAttribute( 'position', new Float32BufferAttribute( vertices, 3 ) );
		this.setAttribute( 'normal', new Float32BufferAttribute( normals, 3 ) );
		this.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );

		function generate() {

			let decalVertices = [];

			const vertex = new Vector3();
			const normal = new Vector3();

			// handle different geometry types

			const geometry = mesh.geometry;

			const positionAttribute = geometry.attributes.position;
			const normalAttribute = geometry.attributes.normal;

			// first, create an array of 'DecalVertex' objects
			// three consecutive 'DecalVertex' objects represent a single face
			//
			// this data structure will be later used to perform the clipping

			if ( geometry.index !== null ) {

				// indexed BufferGeometry

				const index = geometry.index;

				for ( let i = 0; i < index.count; i ++ ) {

					vertex.fromBufferAttribute( positionAttribute, index.getX( i ) );
					normal.fromBufferAttribute( normalAttribute, index.getX( i ) );

					pushDecalVertex( decalVertices, vertex, normal );

				}

			} else {

				// non-indexed BufferGeometry

				for ( let i = 0; i < positionAttribute.count; i ++ ) {

					vertex.fromBufferAttribute( positionAttribute, i );
					normal.fromBufferAttribute( normalAttribute, i );

					pushDecalVertex( decalVertices, vertex, normal );

				}

			}

			// second, clip the geometry so that it doesn't extend out from the projector

			decalVertices = clipGeometry( decalVertices, plane.set( 1, 0, 0 ) );
			decalVertices = clipGeometry( decalVertices, plane.set( - 1, 0, 0 ) );
			decalVertices = clipGeometry( decalVertices, plane.set( 0, 1, 0 ) );
			decalVertices = clipGeometry( decalVertices, plane.set( 0, - 1, 0 ) );
			decalVertices = clipGeometry( decalVertices, plane.set( 0, 0, 1 ) );
			decalVertices = clipGeometry( decalVertices, plane.set( 0, 0, - 1 ) );

			// third, generate final vertices, normals and uvs

			for ( let i = 0; i < decalVertices.length; i ++ ) {

				const decalVertex = decalVertices[ i ];

				// create texture coordinates (we are still in projector space)

				uvs.push(
					0.5 + ( decalVertex.position.x / size.x ),
					0.5 + ( decalVertex.position.y / size.y )
				);

				// transform the vertex back to world space

				decalVertex.position.applyMatrix4( projectorMatrix );

				// now create vertex and normal buffer data

				vertices.push( decalVertex.position.x, decalVertex.position.y, decalVertex.position.z );
				normals.push( decalVertex.normal.x, decalVertex.normal.y, decalVertex.normal.z );

			}

		}

		function pushDecalVertex( decalVertices, vertex, normal ) {

			// transform the vertex to world space, then to projector space

			vertex.applyMatrix4( mesh.matrixWorld );
			vertex.applyMatrix4( projectorMatrixInverse );

			normal.transformDirection( mesh.matrixWorld );

			decalVertices.push( new DecalVertex( vertex.clone(), normal.clone() ) );

		}

		function clipGeometry( inVertices, plane ) {

			const outVertices = [];

			const s = 0.5 * Math.abs( size.dot( plane ) );

			// a single iteration clips one face,
			// which consists of three consecutive 'DecalVertex' objects

			for ( let i = 0; i < inVertices.length; i += 3 ) {

				let total = 0;
				let nV1;
				let nV2;
				let nV3;
				let nV4;

				const d1 = inVertices[ i + 0 ].position.dot( plane ) - s;
				const d2 = inVertices[ i + 1 ].position.dot( plane ) - s;
				const d3 = inVertices[ i + 2 ].position.dot( plane ) - s;

				const v1Out = d1 > 0;
				const v2Out = d2 > 0;
				const v3Out = d3 > 0;

				// calculate, how many vertices of the face lie outside of the clipping plane

				total = ( v1Out ? 1 : 0 ) + ( v2Out ? 1 : 0 ) + ( v3Out ? 1 : 0 );

				switch ( total ) {

					case 0: {

						// the entire face lies inside of the plane, no clipping needed

						outVertices.push( inVertices[ i ] );
						outVertices.push( inVertices[ i + 1 ] );
						outVertices.push( inVertices[ i + 2 ] );
						break;

					}

					case 1: {

						// one vertex lies outside of the plane, perform clipping

						if ( v1Out ) {

							nV1 = inVertices[ i + 1 ];
							nV2 = inVertices[ i + 2 ];
							nV3 = clip( inVertices[ i ], nV1, plane, s );
							nV4 = clip( inVertices[ i ], nV2, plane, s );

						}

						if ( v2Out ) {

							nV1 = inVertices[ i ];
							nV2 = inVertices[ i + 2 ];
							nV3 = clip( inVertices[ i + 1 ], nV1, plane, s );
							nV4 = clip( inVertices[ i + 1 ], nV2, plane, s );

							outVertices.push( nV3 );
							outVertices.push( nV2.clone() );
							outVertices.push( nV1.clone() );

							outVertices.push( nV2.clone() );
							outVertices.push( nV3.clone() );
							outVertices.push( nV4 );
							break;

						}

						if ( v3Out ) {

							nV1 = inVertices[ i ];
							nV2 = inVertices[ i + 1 ];
							nV3 = clip( inVertices[ i + 2 ], nV1, plane, s );
							nV4 = clip( inVertices[ i + 2 ], nV2, plane, s );

						}

						outVertices.push( nV1.clone() );
						outVertices.push( nV2.clone() );
						outVertices.push( nV3 );

						outVertices.push( nV4 );
						outVertices.push( nV3.clone() );
						outVertices.push( nV2.clone() );

						break;

					}

					case 2: {

						// two vertices lies outside of the plane, perform clipping

						if ( ! v1Out ) {

							nV1 = inVertices[ i ].clone();
							nV2 = clip( nV1, inVertices[ i + 1 ], plane, s );
							nV3 = clip( nV1, inVertices[ i + 2 ], plane, s );
							outVertices.push( nV1 );
							outVertices.push( nV2 );
							outVertices.push( nV3 );

						}

						if ( ! v2Out ) {

							nV1 = inVertices[ i + 1 ].clone();
							nV2 = clip( nV1, inVertices[ i + 2 ], plane, s );
							nV3 = clip( nV1, inVertices[ i ], plane, s );
							outVertices.push( nV1 );
							outVertices.push( nV2 );
							outVertices.push( nV3 );

						}

						if ( ! v3Out ) {

							nV1 = inVertices[ i + 2 ].clone();
							nV2 = clip( nV1, inVertices[ i ], plane, s );
							nV3 = clip( nV1, inVertices[ i + 1 ], plane, s );
							outVertices.push( nV1 );
							outVertices.push( nV2 );
							outVertices.push( nV3 );

						}

						break;

					}

					case 3: {

						// the entire face lies outside of the plane, so let's discard the corresponding vertices

						break;

					}

				}

			}

			return outVertices;

		}

		function clip( v0, v1, p, s ) {

			const d0 = v0.position.dot( p ) - s;
			const d1 = v1.position.dot( p ) - s;

			const s0 = d0 / ( d0 - d1 );

			const v = new DecalVertex(
				new Vector3(
					v0.position.x + s0 * ( v1.position.x - v0.position.x ),
					v0.position.y + s0 * ( v1.position.y - v0.position.y ),
					v0.position.z + s0 * ( v1.position.z - v0.position.z )
				),
				new Vector3(
					v0.normal.x + s0 * ( v1.normal.x - v0.normal.x ),
					v0.normal.y + s0 * ( v1.normal.y - v0.normal.y ),
					v0.normal.z + s0 * ( v1.normal.z - v0.normal.z )
				)
			);

			// need to clip more values (texture coordinates)? do it this way:
			// intersectpoint.value = a.value + s * ( b.value - a.value );

			return v;

		}

	}

}

// helper

class DecalVertex {

	constructor( position, normal ) {

		this.position = position;
		this.normal = normal;

	}

	clone() {

		return new this.constructor( this.position.clone(), this.normal.clone() );

	}

}



const S = 256;
function rng(seed) {
    let s = seed >>> 0;
    return ()=>{
        s = s + 0x6d2b79f5 >>> 0;
        let t = s;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function makeNoise(seed) {
    const N = 64;
    const r = rng(seed);
    const t = new Float32Array(N * N);
    for(let i = 0; i < t.length; i++)t[i] = r();
    const at = (x, y)=>t[(y & N - 1) * N + (x & N - 1) | 0];
    const n = (x, y)=>{
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const fx = x - xi;
        const fy = y - yi;
        const u = fx * fx * (3 - 2 * fx);
        const v = fy * fy * (3 - 2 * fy);
        return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
    };
    return (x, y, oct = 4)=>{
        let a = 0.5;
        let s = 0;
        let m = 0;
        for(let o = 0; o < oct; o++){
            s += n(x, y) * a;
            m += a;
            x *= 2.03;
            y *= 2.03;
            a *= 0.5;
        }
        return s / m;
    };
}
const sstep = (a, b, x)=>{
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};
const clamp01 = (x)=>Math.min(1, Math.max(0, x));
const mix = (a, b, t)=>a + (b - a) * t;
function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy + 1e-9));
    return {
        d: Math.hypot(px - ax - dx * t, py - ay - dy * t),
        t
    };
}
function newLayers() {
    const n = S * S;
    return {
        cr: new Float32Array(n),
        cg: new Float32Array(n),
        cb: new Float32Array(n),
        alpha: new Float32Array(n),
        height: new Float32Array(n),
        bump: new Float32Array(n),
        rough: new Float32Array(n).fill(0.9),
        metal: new Float32Array(n)
    };
}
function each(f) {
    for(let j = 0; j < S; j++){
        const y = (j + 0.5) / S * 2 - 1;
        for(let i = 0; i < S; i++){
            const x = (i + 0.5) / S * 2 - 1;
            f(x, y, Math.hypot(x, y), Math.atan2(y, x), j * S + i);
        }
    }
}
function put(L, i, r, g, b, a) {
    const a0 = L.alpha[i];
    const ao = a + a0 * (1 - a);
    if (ao <= 1e-5) return;
    L.cr[i] = (r * a + L.cr[i] * a0 * (1 - a)) / ao;
    L.cg[i] = (g * a + L.cg[i] * a0 * (1 - a)) / ao;
    L.cb[i] = (b * a + L.cb[i] * a0 * (1 - a)) / ao;
    L.alpha[i] = ao;
}
function paintConcrete(L, seed, grazing) {
    const rnd = rng(seed);
    const nz = makeNoise(seed * 7 + 1);
    const Rb = 0.32 + rnd() * 0.14;
    const rh = 0.04 + rnd() * 0.012;
    const bx = (rnd() - 0.5) * 0.12;
    const by = (rnd() - 0.5) * 0.12;
    const lobes = Array.from({
        length: 2 + Math.floor(rnd() * 2)
    }, ()=>({
            a: rnd() * Math.PI * 2,
            w: 0.5 + rnd() * 0.7,
            k: 0.25 + rnd() * 0.55
        }));
    const facets = 5 + Math.floor(rnd() * 4);
    const fph = rnd() * 6.28;
    const segs = [];
    const walk = (x0, y0, ang, len, w, depth)=>{
        let x = x0, y = y0;
        const n = 5 + Math.floor(rnd() * 4);
        for(let k = 0; k < n; k++){
            ang += (rnd() - 0.5) * 0.7;
            const l = len / n * (0.6 + rnd() * 0.8);
            const nx = x + Math.cos(ang) * l, ny = y + Math.sin(ang) * l;
            const wk = w * (1 - k / n * 0.75);
            segs.push({
                ax: x,
                ay: y,
                bx: nx,
                by: ny,
                w: wk
            });
            if (depth < 2 && rnd() < 0.28) walk(nx, ny, ang + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), len * (0.3 + rnd() * 0.3), wk * 0.7, depth + 1);
            x = nx;
            y = ny;
            if (Math.hypot(x, y) > 0.97) break;
        }
    };
    const nc = 4 + Math.floor(rnd() * 4);
    for(let c = 0; c < nc; c++){
        const ang = c / nc * Math.PI * 2 + (rnd() - 0.5) * 1.1;
        walk(bx + Math.cos(ang) * Rb * 0.6, by + Math.sin(ang) * Rb * 0.6, ang, 0.35 + rnd() * 0.6, 0.014 + rnd() * 0.01, 0);
    }
    const fan = rnd() * Math.PI * 2;
    each((x, y, r, a, i)=>{
        const dxb = x - bx, dyb = y - by;
        const rb = Math.hypot(dxb, dyb);
        const ab = Math.atan2(dyb, dxb);
        let lobe = 0;
        for (const l of lobes){
            const d = Math.atan2(Math.sin(ab - l.a), Math.cos(ab - l.a));
            lobe += l.k * Math.exp(-(d * d) / (l.w * l.w));
        }
        const fac = Math.abs(Math.cos((ab + fph) * facets / 2));
        const edge = Rb * (0.55 + 0.5 * lobe) * (0.9 + 0.12 * fac) * (0.85 + 0.3 * nz(Math.cos(ab) * 2.2 + 5, Math.sin(ab) * 2.2 + 9, 3));
        const inside = 1 - sstep(edge * 0.9, edge, rb);
        const depthK = clamp01(1 - rb / edge);
        const grain = nz(x * 16 + 3, y * 16 + 7, 3);
        const agg = sstep(0.55, 0.7, nz(x * 9 + 11, y * 9 + 4, 2));
        const lime = sstep(0.6, 0.72, nz(x * 22 + 31, y * 22 + 17, 2));
        let lum = mix(0.54, 0.36, Math.pow(depthK, 1.2)) * (0.85 + 0.25 * grain);
        lum = mix(lum, 0.3, agg * 0.5);
        lum = mix(lum, 0.66, lime * 0.6);
        if (inside > 0) put(L, i, lum * 1.01, lum * 0.995, lum * 0.965, inside);
        const rimN = 0.3 + 0.7 * sstep(0.4, 0.7, nz(ab * 3 + 1, rb * 8, 2));
        const rim = Math.exp(-Math.pow((rb - edge) / 0.03, 2)) * rimN;
        if (rim > 0.02) put(L, i, 0.6, 0.59, 0.56, rim * 0.4);
        const lipShadow = Math.exp(-Math.pow((rb - edge * 1.06) / 0.02, 2)) * rimN;
        if (lipShadow > 0.02) put(L, i, 0.2, 0.19, 0.18, lipShadow * 0.22);
        const pit = (1 - sstep(rh, rh * 3.2, rb)) * inside;
        if (pit > 0) put(L, i, 0.24, 0.23, 0.22, pit * 0.55);
        const bore = 1 - sstep(rh * 0.5, rh, rb + 0.02 * nz(x * 20, y * 20, 2));
        if (bore > 0) put(L, i, 0.05, 0.048, 0.045, bore);
        const fanK = 0.55 + 0.45 * Math.cos(a - fan);
        const dust = sstep(0.9, 0.2, r) * (0.05 + 0.5 * sstep(0.35, 0.8, nz(x * 5 + 20, y * 5 + 11, 4))) * (grazing ? 0.4 + 0.6 * fanK : 0.3 + 0.3 * fanK);
        if (dust > 0.003 && rb > edge * 0.95) put(L, i, 0.6, 0.58, 0.55, dust * 0.26);
        let h = -0.75 * Math.pow(depthK, 0.7) * inside;
        h += 0.1 * (fac - 0.5) * inside * (1 - depthK);
        h -= 0.6 * (1 - sstep(rh * 0.4, rh * 1.2, rb));
        h += 0.08 * rim;
        L.height[i] += h;
        L.bump[i] += ((grain - 0.5) * 0.16 + agg * 0.09 + lime * 0.05) * inside + (grain - 0.5) * 0.05 * (1 - inside) * sstep(0.95, 0.4, r);
        L.rough[i] = mix(0.92, 0.98, inside);
        for (const c of segs){
            const q = segDist(x, y, c.ax, c.ay, c.bx, c.by);
            if (q.d > c.w * 2.6) continue;
            const core = 1 - sstep(c.w * 0.18, c.w * 0.5, q.d);
            const lip = Math.exp(-Math.pow((q.d - c.w * 0.6) / (c.w * 0.4), 2)) * (0.5 + 0.5 * nz(q.t * 12 + c.ax * 9, c.ay * 9, 2));
            if (lip > 0.01) put(L, i, 0.52, 0.5, 0.47, lip * 0.2);
            if (core > 0.01) put(L, i, 0.16, 0.155, 0.15, core * 0.4);
            L.bump[i] += 0.12 * lip - 0.28 * core;
        }
    });
}
function paintRubble(L, seed) {
    const rnd = rng(seed);
    const nz = makeNoise(seed * 5 + 17);
    const bits = Array.from({
        length: 40 + Math.floor(rnd() * 30)
    }, ()=>{
        const a = rnd() * Math.PI * 2;
        const d = Math.pow(rnd(), 0.8) * 0.8;
        return {
            x: Math.cos(a) * d * 1.2,
            y: Math.sin(a) * d * 0.7,
            r: 0.008 + Math.pow(rnd(), 3) * 0.035,
            l: 0.35 + rnd() * 0.3
        };
    });
    each((x, y, r, _a, i)=>{
        const e = Math.hypot(x / 1.2, y / 0.75);
        const dust = (1 - sstep(0.2, 0.95, e)) * (0.35 + 0.65 * nz(x * 6 + 3, y * 6 + 1, 4));
        if (dust > 0.01) put(L, i, 0.5, 0.48, 0.45, dust * 0.35);
        for (const b of bits){
            const d = Math.hypot(x - b.x, y - b.y);
            if (d > b.r * 1.6) continue;
            const k = 1 - sstep(b.r * 0.6, b.r, d * (0.85 + 0.3 * nz(x * 40, y * 40, 2)));
            if (k > 0.01) {
                put(L, i, b.l, b.l * 0.97, b.l * 0.92, k);
                L.height[i] += 0.5 * k * (1 - d / b.r);
            }
        }
        L.rough[i] = 0.95;
        void r;
    });
}
function paintMetal(L, seed, grazing) {
    const rnd = rng(seed), nz = makeNoise(seed * 5 + 3), rh = .125 + rnd() * .018, phase = rnd() * 6.28, petals = 5 + Math.floor(rnd() * 3);
    const chips = Array.from({
        length: 9
    }, ()=>({
            a: rnd() * 6.28,
            r: .20 + rnd() * .23,
            w: .016 + rnd() * .025,
            l: .08 + rnd() * .13
        }));
    each((x, y, r, a, i)=>{
        const n = nz(x * 19 + 2, y * 19 + 7, 3), edge = rh * (.86 + .14 * Math.cos(a * petals + phase) + .17 * n);
        const bore = 1 - sstep(edge * .76, edge, r), dish = 1 - sstep(edge * 1.12, .31 + .06 * Math.sin(a * 3 + phase), r);
        const lip = Math.exp(-Math.pow((r - edge * 1.22) / .025, 2)) * (.35 + .65 * n);
        if (dish > .003) {
            const c = .46 + .12 * n - .10 * dish;
            put(L, i, c, c * 1.025, c * 1.055, dish * .68);
        }
        if (lip > .003) put(L, i, .66 + .13 * n, .68 + .13 * n, .70 + .13 * n, lip * .94);
        L.height[i] = -.22 * dish - .62 * bore + .17 * lip;
        L.bump[i] = (n - .5) * .018 * dish;
        L.metal[i] = (1 - bore) * clamp01(.8 * dish + lip);
        L.rough[i] = mix(.68, .34, lip);
        for (const c of chips){
            const q = segDist(x, y, Math.cos(c.a) * c.r, Math.sin(c.a) * c.r, Math.cos(c.a + .08) * (c.r + c.l), Math.sin(c.a + .08) * (c.r + c.l));
            const k = (1 - sstep(c.w * .12, c.w, q.d)) * (1 - q.t * .8);
            if (k > .003) {
                put(L, i, .60 + .12 * n, .62 + .12 * n, .65 + .12 * n, k * .8);
                L.bump[i] -= .035 * k;
                L.metal[i] = Math.max(L.metal[i], k * .8);
            }
        }
        if (bore > 0) put(L, i, .065, .066, .071, bore);
    });
}
function paintWood(L, seed, grazing) {
    const rnd = rng(seed), nz = makeNoise(seed * 3 + 9), phase = rnd() * 6.28, rx = .24 + rnd() * .045, ry = .34 + rnd() * .06;
    const splinters = Array.from({
        length: 8
    }, ()=>({
            x: (rnd() - .5) * .34,
            sg: rnd() < .5 ? -1 : 1,
            l: .40 + rnd() * .42,
            w: .006 + rnd() * .014,
            bend: (rnd() - .5) * .10
        }));
    each((x, y, r, a, i)=>{
        const fibre = nz(x * 45 + 4, y * 3 + 8, 3), facet = nz(x * 12 + 3, y * 9 + 7, 2);
        const er = Math.hypot((x + .025 * Math.sin(y * 10)) / rx, y / ry), sector = Math.floor((a + phase) * 9 / 6.283), edge = .86 + .13 * Math.sin(sector * 2.31 + phase) + .07 * Math.cos(a * 7 - phase);
        const cone = 1 - sstep(edge * .86, edge, er), d = clamp01(1 - er / edge);
        const boreR = .10 * (.86 + .20 * nz(Math.cos(a) * 5 + 8, Math.sin(a) * 5 + 9, 2));
        const bore = 1 - sstep(boreR * .72, boreR, Math.hypot(x * (grazing ? .82 : 1), y + .022));
        const lip = Math.exp(-Math.pow((er - edge) / .060, 2)) * sstep(.32, .66, fibre);
        if (cone > .003) {
            const cut = Math.floor(x * 13 + y * 3 + facet * 2) / 18, c = .60 + .14 * facet + .09 * Math.sin(sector * 4.7 + cut) - .14 * d;
            put(L, i, c * 1.04, c * .77, c * .48, cone * .94);
        }
        if (lip > .003) put(L, i, .76 + .06 * fibre, .58 + .06 * fibre, .36 + .04 * fibre, lip * .82);
        L.height[i] = -.32 * d * cone - .45 * bore + .10 * lip;
        L.bump[i] = (fibre - .5) * .035 * cone;
        for (const t of splinters){
            const q = segDist(x, y, t.x, t.sg * .12, t.x + t.bend, t.sg * t.l), w = t.w * (1 - q.t * .82), k = 1 - sstep(w * .18, w, q.d);
            if (k > .003) {
                put(L, i, .70 + .08 * fibre, .52 + .07 * fibre, .30 + .05 * fibre, k * .8);
                L.height[i] += .11 * k * Math.sin(q.t * Math.PI);
                L.bump[i] -= .035 * k * (1 - q.t);
            }
        }
        if (bore > 0) {
            put(L, i, .065, .043, .025, bore);
            L.height[i] = mix(L.height[i], -.88, bore);
        }
        L.rough[i] = .88 + .07 * fibre;
    });
}
function paintPaper(L, seed) {
    const rnd = rng(seed), nz = makeNoise(seed * 11 + 5), rh = .14 + rnd() * .018, petals = 4 + Math.floor(rnd() * 3), phase = rnd() * 6.28;
    each((x, y, r, a, i)=>{
        const n = nz(x * 22 + 4, y * 22 + 1, 3), star = Math.pow(.5 + .5 * Math.cos((a - phase) * petals), 3), edge = rh * (.84 + .28 * star + .17 * n);
        const hole = 1 - sstep(edge * .74, edge, r), flap = sstep(edge * .85, edge * 1.08, r) * (1 - sstep(edge * 1.2, edge * (1.55 + star), r));
        const rag = (1 - sstep(edge * 1.5, edge * 2.3, r)) * sstep(.51, .70, n);
        if (flap > .003) put(L, i, .91 + .06 * n, .88 + .06 * n, .79 + .08 * n, flap * .95);
        if (rag > .003) put(L, i, .89, .86, .77, rag * .55);
        L.height[i] = -.65 * hole + .16 * flap * star;
        L.bump[i] = (n - .5) * .018 * (flap + rag);
        if (hole > 0) put(L, i, .075, .069, .059, hole);
        L.rough[i] = .94;
    });
}
function paintFabric(L, seed) {
    const rnd = rng(seed), nz = makeNoise(seed * 13 + 1), rh = .13 + rnd() * .02, phase = rnd() * 6.28;
    const threads = Array.from({
        length: 16
    }, ()=>({
            a: Math.floor(rnd() * 4) * Math.PI / 2 + (rnd() - .5) * .30,
            l: .23 + rnd() * .27,
            w: .003 + rnd() * .004
        }));
    each((x, y, r, a, i)=>{
        const n = nz(x * 16 + 2, y * 16 + 3, 3), edge = rh * (.82 + .17 * Math.cos(a * 3 + phase) + .16 * n), hole = 1 - sstep(edge * .72, edge, r);
        const fold = (1 - sstep(edge * 1.1, .30, r)) * sstep(edge * .88, edge * 1.18, r) * (.25 + .75 * Math.pow(Math.cos(a * 2 + phase), 6));
        if (fold > .003) put(L, i, .55 + .08 * n, .51 + .07 * n, .41 + .06 * n, fold * .28);
        L.height[i] = -.65 * hole + .08 * fold;
        L.bump[i] = Math.sin(x * 148) * Math.sin(y * 148) * .009 * fold;
        for (const t of threads){
            const q = segDist(x, y, Math.cos(t.a) * rh * .92, Math.sin(t.a) * rh * .92, Math.cos(t.a + .10) * t.l, Math.sin(t.a + .10) * t.l), k = 1 - sstep(t.w * .2, t.w, q.d);
            if (k > .003) {
                put(L, i, .70, .64, .51, k * .8);
                L.height[i] += .08 * k * (1 - q.t * .6);
            }
        }
        if (hole > 0) put(L, i, .07, .065, .052, hole);
        L.rough[i] = .97;
    });
}
function paintSoil(L, seed, grazing) {
    const rnd = rng(seed), nz = makeNoise(seed * 17 + 3), phase = rnd() * 6.28, r0 = .30 + rnd() * .04;
    const clods = Array.from({
        length: 23
    }, ()=>{
        const a = rnd() * 6.28, r = .32 + rnd() * .48;
        return {
            x: Math.cos(a) * r,
            y: Math.sin(a) * r,
            r: .009 + rnd() * .033,
            a: rnd() * 6.28
        };
    });
    each((x, y, r, a, i)=>{
        const n = nz(x * 22 + 3, y * 22 + 8, 3), facet = nz(x * 8 + 7, y * 9 + 2, 2);
        const sector = Math.floor((a + phase) * 11 / 6.283), radius = r0 * (.90 + .13 * Math.sin(sector * 2.53 + phase) + .10 * facet);
        const er = Math.hypot(x * (grazing ? .76 : 1), y), cone = 1 - sstep(radius * .80, radius, er), d = clamp01(1 - er / radius);
        const rim = Math.exp(-Math.pow((er - radius) / .026, 2)) * sstep(.30, .65, facet) * (.3 + .7 * n);
        const dust = (1 - sstep(radius, .68, r)) * sstep(.50, .73, n) * .11;
        if (dust > .003) put(L, i, .53, .43, .29, dust);
        if (cone > .003) {
            const grit = nz(x * 72 + 4, y * 72 + 9, 2), c = .44 + .15 * facet + .07 * grit - .10 * d;
            put(L, i, c, c * .82, c * .57, cone * (.68 + .22 * grit));
        }
        if (rim > .003) put(L, i, .59 + .08 * n, .48 + .07 * n, .32 + .05 * n, rim * .72);
        const pitR = .067 * (.86 + .18 * Math.cos(a * 5 + phase)), pit = 1 - sstep(pitR * .66, pitR, Math.hypot(x + .025, y - .018));
        if (pit > .003) put(L, i, .19, .145, .092, pit * .82);
        L.height[i] = -.26 * d * cone - .24 * pit + .075 * rim;
        L.bump[i] = (n - .5) * .045 * (cone + rim);
        for (const c of clods){
            const dx = x - c.x, dy = y - c.y, q = Math.hypot(dx, dy) / c.r, shape = 1 + .12 * Math.cos(Math.atan2(dy, dx) * 5 + c.a), k = 1 - sstep(.55, shape, q);
            if (k > .003) {
                const lum = .49 + .14 * n;
                put(L, i, lum, lum * .81, lum * .55, k * .8);
                L.height[i] += .09 * k;
            }
        }
        L.rough[i] = .98;
    });
}
const DECAL_POOL_MIN = 50;
const DECAL_POOL_MAX = 100;
const SLOTS = DECAL_POOL_MAX + 28;
const VPS = 768;
const ANCHORS = 16;
const FADE_TIME = 0.9;
const POM_MAX = 0.024;
function bake(L, strength, pomDepth, cavity, profile = 0) {
    const n = S * S;
    const col = new Uint8Array(n * 4);
    const nor = new Uint8Array(n * 4);
    const aux = new Uint8Array(n * 4);
    const H = L.height;
    const NH = new Float32Array(n);
    for(let k = 0; k < n; k++)NH[k] = H[k] + L.bump[k];
    const at = (x, y)=>NH[Math.min(S - 1, Math.max(0, y)) * S + Math.min(S - 1, Math.max(0, x))];
    for(let j = 0; j < S; j++){
        for(let i = 0; i < S; i++){
            const k = j * S + i;
            const a = L.alpha[k];
            col[k * 4] = (a > 0.004 ? L.cr[k] : 0.55) * 255;
            col[k * 4 + 1] = (a > 0.004 ? L.cg[k] : 0.53) * 255;
            col[k * 4 + 2] = (a > 0.004 ? L.cb[k] : 0.5) * 255;
            col[k * 4 + 3] = clamp01(a) * 255;
            const dx = (at(i + 1, j - 1) + 2 * at(i + 1, j) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i - 1, j) - at(i - 1, j + 1)) * 0.25;
            const dy = (at(i - 1, j + 1) + 2 * at(i, j + 1) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i, j - 1) - at(i + 1, j - 1)) * 0.25;
            const fade = clamp01(a * 4);
            let nx = -dx * strength * fade;
            let ny = -dy * strength * fade;
            const inv = 1 / Math.hypot(nx, ny, 1);
            nx *= inv;
            ny *= inv;
            nor[k * 4] = (nx * 0.5 + 0.5) * 255;
            nor[k * 4 + 1] = (ny * 0.5 + 0.5) * 255;
            nor[k * 4 + 2] = (profile === 0 ? clamp01(1 + H[k] / 1.1) : clamp01((1 + H[k]) / 1.35)) * 255;
            nor[k * 4 + 3] = clamp01(L.rough[k]) * 255;
            aux[k * 4] = clamp01(L.metal[k]) * 255;
            aux[k * 4 + 1] = clamp01(pomDepth / POM_MAX) * 255;
            aux[k * 4 + 2] = clamp01(cavity) * 255;
            aux[k * 4 + 3] = profile === 0 ? 255 : profile;
        }
    }
    return {
        col,
        nrm: nor,
        aux
    };
}
function arrayTexture(layers, srgb) {
    const data = new Uint8Array(S * S * 4 * layers.length);
    layers.forEach((l, i)=>data.set(l, i * S * S * 4));
    const t = new THREE.DataArrayTexture(data, S, S, layers.length);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
}
const VARIANTS = {
    concrete: 6,
    metal: 6,
    wood: 6,
    paper: 4,
    fabric: 3,
    soil: 5
};
const BUMP = {
    concrete: 3.2,
    metal: 7,
    wood: 6,
    paper: 4,
    fabric: 4,
    soil: 5
};
const POM = {
    concrete: 0.018,
    metal: 0.0025,
    wood: 0.0035,
    paper: 0.0007,
    fabric: 0.001,
    soil: 0.004
};
const vertPars = `
attribute vec4 aMeta; // layer, anchor, facing (cos to projector), fade
attribute vec4 aTint;
uniform vec4 uLife[32];
varying float vLive;
varying vec3 vTint;
uniform mat4 uAnchor[${ANCHORS}];
uniform float uPull;
varying vec2 vDecUv;
varying vec3 vDec;
`;
const fragPars = `
varying vec3 vTint;
varying float vLive;
uniform sampler2DArray tDecCol;
uniform sampler2DArray tDecNrm;
uniform sampler2DArray tDecAux;
uniform float uPomOn;
varying vec2 vDecUv;
varying vec3 vDec;
`;
const fragStart = `
float dLayer = floor(vDec.x + 0.5);
vec2 dUv = vDecUv;
vec3 dPos = -vViewPosition;
vec3 dq0 = dFdx(dPos);
vec3 dq1 = dFdy(dPos);
vec2 dst0 = dFdx(vDecUv);
vec2 dst1 = dFdy(vDecUv);
vec3 dNg = normalize(vNormal);
vec3 dq1p = cross(dq1, dNg);
vec3 dq0p = cross(dNg, dq0);
vec3 dT = dq1p * dst0.x + dq0p * dst1.x;
vec3 dB = dq1p * dst0.y + dq0p * dst1.y;
float dDet = max(dot(dT, dT), dot(dB, dB));
float dSc = dDet == 0.0 ? 0.0 : inversesqrt(dDet);
dT *= dSc;
dB *= dSc;
vec4 dAux = textureLod(tDecAux, vec3(0.5, 0.5, dLayer), 0.0);
// Profile 255 uses the original, unchanged wall/rubble raymarch.
if (dAux.a > 0.9) {
// Parallax occlusion: the crater has real depth that shifts with the view, not a printed shadow.
{
  float uvPerM = sqrt((dot(dst0, dst0) + dot(dst1, dst1)) / max(dot(dq0, dq0) + dot(dq1, dq1), 1e-12));
  vec3 V = normalize(vViewPosition);
  vec3 Vt = vec3(dot(V, dT), dot(V, dB), dot(V, dNg));
  float fade = uPomOn * smoothstep(0.05, 0.25, Vt.z) * (1.0 - smoothstep(8.0, 18.0, length(vViewPosition)));
  if (fade > 0.01) {
    float depthUv = dAux.g * ${POM_MAX.toFixed(4)} * uvPerM * fade;
    float layers = mix(28.0, 10.0, clamp(Vt.z, 0.0, 1.0));
    vec2 P = Vt.xy / max(Vt.z, 0.25) * depthUv;
    vec2 dd = P / layers;
    float dl = 1.0 / layers;
    float cl = 0.0;
    vec2 uv = dUv;
    float dm = 1.0 - textureGrad(tDecNrm, vec3(uv, dLayer), dst0, dst1).b;
    vec2 prevUv = uv;
    float prevDm = dm;
    for (int i = 0; i < 32; i++) {
      if (cl >= dm || float(i) >= layers) break;
      prevUv = uv;
      prevDm = dm;
      uv -= dd;
      cl += dl;
      dm = 1.0 - textureGrad(tDecNrm, vec3(uv, dLayer), dst0, dst1).b;
    }
    float after = dm - cl;
    float before = prevDm - (cl - dl);
    float w = after / (after - before - 1e-5);
    dUv = mix(uv, prevUv, clamp(w, 0.0, 1.0));
  }
}
} else {
  float profile = floor(dAux.a * 255.0 + 0.5);
  float gain = profile < 1.5 ? 1.5 : profile < 2.5 ? 1.8 : profile < 3.5 ? 1.2 : profile < 4.5 ? 1.35 : 2.0;
  vec3 V = normalize(vViewPosition);
  float vz = max(dot(V, dNg), 0.14);
  float enabled = uPomOn * smoothstep(0.06, 0.22, dot(V, dNg)) * (1.0 - smoothstep(8.0, 18.0, length(vViewPosition)));
  if (enabled > 0.01) {
    // Exact screen derivative metric: UV shift per metre, including stretched
    // projections. A normal-view patch and an oblique one keep the same depth.
    float jac = dot(dq0, cross(dq1, dNg));
    float invJac = abs(jac) > 1e-12 ? 1.0 / jac : 0.0;
    vec3 gradU = (cross(dq1, dNg) * dst0.x + cross(dNg, dq0) * dst1.x) * invJac;
    vec3 gradV = (cross(dq1, dNg) * dst0.y + cross(dNg, dq0) * dst1.y) * invJac;
    float depthM = dAux.g * ${POM_MAX.toFixed(4)} * gain * enabled;
    vec2 P = vec2(dot(V, gradU), dot(V, gradV)) * depthM / vz;
    float pLen = length(P); if (pLen > 0.60) P *= 0.60 / pLen;
    float layers = mix(48.0, 22.0, clamp(vz, 0.0, 1.0));
    float dl = 1.0 / layers;
    // Surface H=0 is at 1/1.35. Start above it so both raised lips and
    // recessed bores move correctly; intact texels have zero UV displacement.
    float datumDepth = 1.0 - 1.0 / 1.35;
    vec2 origin = dUv;
    float t = 0.0;
    vec2 uv = origin + P * datumDepth;
    float surfaceDepth = 1.0 - textureGrad(tDecNrm, vec3(uv, dLayer), dst0, dst1).b;
    for (int i = 0; i < 52; i++) {
      if (t >= surfaceDepth || float(i) >= layers) break;
      t += dl;
      uv = origin + P * (datumDepth - t);
      surfaceDepth = 1.0 - textureGrad(tDecNrm, vec3(uv, dLayer), dst0, dst1).b;
    }
    float lo = max(0.0, t - dl), hi = t;
    for (int j = 0; j < 4; j++) {
      float mid = 0.5 * (lo + hi);
      vec2 mu = origin + P * (datumDepth - mid);
      float md = 1.0 - textureGrad(tDecNrm, vec3(mu, dLayer), dst0, dst1).b;
      if (mid >= md) hi = mid; else lo = mid;
    }
    dUv = origin + P * (datumDepth - 0.5 * (lo + hi));
  }
}
vec4 dC = textureGrad(tDecCol, vec3(dUv, dLayer), dst0, dst1);
vec4 dN = textureGrad(tDecNrm, vec3(dUv, dLayer), dst0, dst1);
float dMetal = textureGrad(tDecAux, vec3(dUv, dLayer), dst0, dst1).r;
float dH = dN.b;
// Coverage: painted alpha, soft clip at the projector box edge, faces turned away from the projector
// (the side of a pillar past a corner) fade out instead of smearing, and the per-mark dissolve.
vec2 dE = min(vDecUv, 1.0 - vDecUv);
float dCov = dC.a * smoothstep(0.0, 0.035, min(dE.x, dE.y)) * smoothstep(0.22, 0.5, vDec.y) * vDec.z * vLive;
if (dCov < 0.003) discard;
`;
const mapFrag = `
// Match the intact rim/dust to the local linear albedo, retaining the
// black bore, exposed metal and bright newly torn fibres as material damage.
float tintWeight = smoothstep(0.015, 0.12, dot(dC.rgb,vec3(.2126,.7152,.0722)));
tintWeight *= mix(.85,.14,clamp(dMetal,0.0,1.0));
vec3 adapted = dC.rgb * mix(vec3(1.0),vTint,tintWeight);
diffuseColor.rgb *= adapted;
diffuseColor.a = dCov;
if (dAux.a > 0.9) {
  diffuseColor.rgb *= mix(1.0, 0.45 + 0.55 * smoothstep(0.0, 0.85, dH), dAux.b);
} else {
  float recess = clamp(dH * 1.35, 0.0, 1.0);
  diffuseColor.rgb *= mix(1.0, 0.76 + 0.24 * smoothstep(0.0, 0.95, recess), dAux.b);
}
`;
const normalFrag = `
{
  vec2 nxy = dN.rg * 2.0 - 1.0;
  vec3 mapN = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
  normal = normalize(dT * mapN.x + dB * mapN.y + normal * mapN.z);
}
`;
const cavityFrag = `
{
  // Local crater cavity shading, derived solely from the mark's own height map.
  float visibleHeight = dAux.a > 0.9 ? dH : clamp(dH * 1.35, 0.0, 1.0);
  float sAO = mix(1.0, 0.3 + 0.7 * visibleHeight, dAux.b);
  reflectedLight.indirectDiffuse *= sAO;
  reflectedLight.indirectSpecular *= sAO;
  reflectedLight.directDiffuse *= mix(1.0, sAO, 0.4);
  reflectedLight.directSpecular *= mix(1.0, sAO, 0.24);
}
`;
const guardFrag = `
if (!(gl_FragColor.r >= 0.0) || !(gl_FragColor.g >= 0.0) || !(gl_FragColor.b >= 0.0) || gl_FragColor.r > 65000.0 || gl_FragColor.g > 65000.0 || gl_FragColor.b > 65000.0) gl_FragColor.rgb = vec3(0.0);
`;
function makePoolMaterial(col, nrm, aux, anchors, parallax, life) {
    const m = new THREE.MeshStandardMaterial({
        roughness: 1,
        metalness: 1,
        transparent: true,
        depthWrite: false,
        envMapIntensity: 0.45
    });
    const local = {
        uLife: {
            value: life
        },
        uPomOn: {
            value: parallax ? 1 : 0
        },
        tDecCol: {
            value: col
        },
        tDecNrm: {
            value: nrm
        },
        tDecAux: {
            value: aux
        },
        uAnchor: {
            value: anchors
        },
        uPull: {
            value: 3.5e-4
        }
    };
    m.onBeforeCompile = (shader)=>{
        Object.assign(shader.uniforms, local);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + vertPars).replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        mat4 dA = uAnchor[int(aMeta.y + 0.5)];
        objectNormal = normalize(mat3(dA) * objectNormal);`).replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed = (dA * vec4(transformed, 1.0)).xyz + objectNormal * 0.0003;
        vDecUv = uv;
        vTint = aTint.rgb;
        int lifeId=int(aTint.w+0.5);vLive=uLife[lifeId/4][lifeId%4];
        vDec = aMeta.xzw;`).replace('#include <project_vertex>', `#include <project_vertex>
        mvPosition.xyz *= 1.0 - uPull;
        gl_Position = projectionMatrix * mvPosition;`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + fragPars).replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + fragStart).replace('#include <map_fragment>', mapFrag).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * dN.a;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * dMetal;').replace('#include <normal_fragment_maps>', normalFrag).replace('#include <aomap_fragment>', cavityFrag).replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + guardFrag);
    };
    m.customProgramCacheKey = ()=>'aegisSurfaceBoundDecalPool8';
    return m;
}
const _e = new THREE.Euler();
const _m4 = new THREE.Matrix4();
const _n3 = new THREE.Matrix3();
const _sph = new THREE.Sphere();
const _lsph = new THREE.Sphere();
const _inv = new THREE.Matrix4();
const _cp = new THREE.Vector3();
function localPatch(m, s) {
    const bvh = m.geometry.boundsTree;
    if (!bvh) return m;
    _inv.copy(m.matrixWorld).invert();
    _lsph.copy(s).applyMatrix4(_inv);
    const pos = [];
    bvh.shapecast({
        intersectsBounds: (box)=>box.intersectsSphere(_lsph),
        intersectsTriangle: (tri)=>{
            if (tri.closestPointToPoint(_lsph.center, _cp).distanceTo(_lsph.center) > _lsph.radius) return false;
            pos.push(tri.a.x, tri.a.y, tri.a.z, tri.b.x, tri.b.y, tri.b.z, tri.c.x, tri.c.y, tri.c.z);
            return pos.length > 9 * 800;
        }
    });
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const p = new THREE.Mesh(g, m.material);
    p.matrixAutoUpdate = false;
    p.matrix.copy(m.matrixWorld);
    p.matrixWorld.copy(m.matrixWorld);
    return p;
}
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _fn = new THREE.Vector3();
const _vn = new THREE.Vector3();
function topOf(o) {
    while(o.parent)o = o.parent;
    return o;
}
function updateSource(source) {
    if (source.userData.impactSource) source.updateMatrixWorld(true);
    else source.updateWorldMatrix(true, false);
}
function captureBinding(source, point, radius) {
    const owner = source.userData.impactSource || source;
    updateSource(source);
    const geometry = source.geometry, position = geometry.getAttribute('position'), index = geometry.index;
    if (!position) return;
    const local = point.clone().applyMatrix4(source.matrixWorld.clone().invert());
    const inv = source.matrixWorld.clone().invert(), sphere = new THREE.Sphere(point.clone(), radius).applyMatrix4(inv), triangle = new THREE.Triangle(), closest = new THREE.Vector3(), proof = [];
    const keep = (face)=>{
        const ids = [
            0,
            1,
            2
        ].map((k)=>index ? index.getX(face * 3 + k) : face * 3 + k);
        if (ids.some((k)=>k >= position.count)) return;
        triangle.a.fromBufferAttribute(position, ids[0]);
        triangle.b.fromBufferAttribute(position, ids[1]);
        triangle.c.fromBufferAttribute(position, ids[2]);
        triangle.closestPointToPoint(local, closest);
        if (closest.distanceToSquared(local) > sphere.radius * sphere.radius) return;
        for (const i of ids)proof.push(i, position.getX(i), position.getY(i), position.getZ(i));
    };
    const bvh = geometry.boundsTree;
    if (bvh) bvh.shapecast({
        intersectsBounds: (box)=>box.intersectsSphere(sphere),
        intersectsTriangle: (_t, i)=>{
            keep(i);
            return proof.length > 24000;
        }
    });
    else {
        const faces = Math.floor((index ? index.count : position.count) / 3);
        for(let i = 0; i < faces; i++)keep(i);
    }
    if (!proof.length) return;
    return {
        source,
        owner,
        geometry,
        position,
        index,
        version: position.version,
        indexVersion: index?.version || 0,
        proof,
        root: topOf(owner),
        matrix: source.matrixWorld.clone()
    };
}
class Decals {
    options;
    layerOf = {
        concrete: [],
        metal: [],
        wood: [],
        paper: [],
        fabric: [],
        soil: []
    };
    rubbleLayers = [];
    targets = [];
    targetBoxes = new Map();
    static Z = new THREE.Vector3(0, 0, 1);
    geo = new THREE.BufferGeometry();
    aPos;
    aNor;
    aUv;
    aMeta;
    aTint;
    life = new Float32Array(SLOTS);
    mesh;
    slots = Array.from({
        length: SLOTS
    }, ()=>({
            state: 0,
            fade: 0,
            anchor: 0,
            used: 0
        }));
    ring = [];
    anchorMats = Array.from({
        length: ANCHORS
    }, ()=>new THREE.Matrix4());
    anchorObj = Array(ANCHORS).fill(null);
    anchorRefs = Array(ANCHORS).fill(0);
    textures = [];
    constructor(scene, options = {}){
        this.options = {
            maxDecals: options.maxDecals ?? 96,
            layer: options.layer ?? 0,
            parallax: options.parallax ?? true
        };
        const col = [];
        const nrm = [];
        const aux = [];
        const addLayer = (b)=>{
            col.push(b.col);
            nrm.push(b.nrm);
            aux.push(b.aux);
            return col.length - 1;
        };
        for (const kind of Object.keys(VARIANTS)){
            for(let v = 0; v < VARIANTS[kind]; v++){
                const L = newLayers();
                const seed = 101 + v * 37 + kind.length * 11;
                const grazing = v === VARIANTS[kind] - 1;
                if (kind === 'concrete') paintConcrete(L, seed, grazing);
                else if (kind === 'metal') paintMetal(L, seed, grazing);
                else if (kind === 'wood') paintWood(L, seed, grazing);
                else if (kind === 'paper') paintPaper(L, seed);
                else if (kind === 'fabric') paintFabric(L, seed);
                else paintSoil(L, seed, grazing);
                const profile = kind === 'metal' ? 1 : kind === 'wood' ? 2 : kind === 'paper' ? 3 : kind === 'fabric' ? 4 : kind === 'soil' ? 5 : 0;
                this.layerOf[kind].push(addLayer(bake(L, BUMP[kind], POM[kind], kind === 'concrete' ? 0.35 : kind === 'soil' ? 0.18 : 0.28, profile)));
            }
        }
        for(let v = 0; v < 3; v++){
            const L = newLayers();
            paintRubble(L, 900 + v * 71);
            this.rubbleLayers.push(addLayer(bake(L, 2.5, 0.003, 0.5)));
        }
        const n = SLOTS * VPS;
        const mk = (size)=>new THREE.BufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage);
        this.aPos = mk(3);
        this.aNor = mk(3);
        this.aUv = mk(2);
        this.aMeta = mk(4);
        this.aTint = mk(4);
        this.geo.setAttribute('position', this.aPos);
        this.geo.setAttribute('normal', this.aNor);
        this.geo.setAttribute('uv', this.aUv);
        this.geo.setAttribute('aMeta', this.aMeta);
        this.geo.setAttribute('aTint', this.aTint);
        this.geo.setDrawRange(0, 0);
        const colTex = arrayTexture(col, true), nrmTex = arrayTexture(nrm, false), auxTex = arrayTexture(aux, false);
        this.textures = [
            colTex,
            nrmTex,
            auxTex
        ];
        const mat = makePoolMaterial(colTex, nrmTex, auxTex, this.anchorMats, this.options.parallax, this.life);
        this.mesh = new THREE.Mesh(this.geo, mat);
        this.mesh.frustumCulled = false;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.layers.set(this.options.layer);
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = false;
        this.mesh.renderOrder = 1;
        this.mesh.onBeforeRender = ()=>{
            this.validateSurfaces();
            for(let i = 1; i < ANCHORS; i++){
                const o = this.anchorObj[i];
                if (o) this.anchorMats[i].copy(o.matrixWorld);
            }
        };
        scene.add(this.mesh);
    }
    dispose() {
        this.mesh.removeFromParent();
        this.geo.dispose();
        const m = this.mesh.material;
        m.dispose();
        for (const t of this.textures)t.dispose();
        this.targets = [];
        this.targetBoxes.clear();
        this.anchorObj.fill(null);
        this.ring.length = 0;
    }
    setTargets(meshes) {
        this.targets = meshes.filter((m)=>m.isMesh && !m.isInstancedMesh && !m.isSkinnedMesh);
        this.targetBoxes.clear();
    }
    get count() {
        return this.slots.filter((s)=>s.state !== 0).length;
    }
    boxOf(m) {
        let b = this.targetBoxes.get(m);
        if (!b) {
            m.updateMatrixWorld(true);
            b = new THREE.Box3().setFromObject(m);
            this.targetBoxes.set(m, b);
        }
        return b;
    }
    kindOf(surface) {
        switch(surface){
            case 'metal':
                return 'metal';
            case 'wood':
                return 'wood';
            case 'paper':
                return 'paper';
            case 'fabric':
                return 'fabric';
            case 'soil':
                return 'soil';
            default:
                return 'concrete';
        }
    }
    project(target, moving, point, quat, sx, sy, front, back, normal) {
        const cands = [];
        const tm = target;
        const ok = (m)=>{
            const g = m.geometry;
            const n = g.index ? g.index.count : g.getAttribute('position')?.count ?? 0;
            return !m.isInstancedMesh && !m.isSkinnedMesh && n > 0 && (n < 150000 || !!g.boundsTree);
        };
        if (tm?.isMesh && ok(tm)) cands.push(tm);
        const center = point.clone().addScaledVector(normal, (front - back) * 0.5);
        const size = new THREE.Vector3(sx, sy, front + back);
        if (!moving && !target) {
            _sph.set(center, Math.hypot(sx, sy, front + back) * 0.5);
            for (const m of this.targets){
                if (cands.length >= 5) break;
                if (m === tm || !m.visible || !ok(m)) continue;
                if (this.boxOf(m).intersectsSphere(_sph)) cands.push(m);
            }
        }
        if (!cands.length) return null;
        _e.setFromQuaternion(quat, 'XYZ');
        const out = {
            pos: [],
            nor: [],
            uv: [],
            facing: []
        };
        _sph.set(center, Math.hypot(sx, sy, front + back) * 0.5 + 0.02);
        for (const m0 of cands){
            m0.updateMatrixWorld(true);
            const n0 = m0.geometry.index ? m0.geometry.index.count : m0.geometry.getAttribute('position').count;
            const m = n0 > 3000 ? localPatch(m0, _sph) : m0;
            if (!m) continue;
            const g = new DecalGeometry(m, center, _e, size);
            if (m !== m0) m.geometry.dispose();
            const pos = g.getAttribute('position');
            const nor = g.getAttribute('normal');
            const uv = g.getAttribute('uv');
            if (pos && uv) {
                for(let t = 0; t + 2 < pos.count; t += 3){
                    if (out.pos.length / 3 + 3 > VPS) break;
                    _a.fromBufferAttribute(pos, t);
                    _b.fromBufferAttribute(pos, t + 1);
                    _c.fromBufferAttribute(pos, t + 2);
                    _fn.subVectors(_b, _a).cross(_c.sub(_a));
                    const len = _fn.length();
                    if (len < 1e-12) continue;
                    _fn.divideScalar(len);
                    const cos = _fn.dot(normal);
                    if (cos < 0.2) continue;
                    for(let k = 0; k < 3; k++){
                        out.pos.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
                        if (nor) _vn.fromBufferAttribute(nor, t + k);
                        if (!nor || _vn.dot(_fn) < 0.2) _vn.copy(_fn);
                        out.nor.push(_vn.x, _vn.y, _vn.z);
                        out.uv.push(uv.getX(t + k), uv.getY(t + k));
                        out.facing.push(cos);
                    }
                }
            }
            g.dispose();
        }
        if (!out.pos.length) return null;
        return out;
    }
    maxLive() {
        return Math.round(Math.min(DECAL_POOL_MAX, Math.max(DECAL_POOL_MIN, this.options.maxDecals)));
    }
    anchorFor(o) {
        let i = this.anchorObj.indexOf(o);
        if (i > 0) return i;
        i = this.anchorObj.findIndex((x, k)=>k > 0 && x === null);
        if (i < 0) return -1;
        this.anchorObj[i] = o;
        this.anchorRefs[i] = 0;
        this.anchorMats[i].copy(o.matrixWorld);
        return i;
    }
    releaseAnchor(i) {
        if (i <= 0) return;
        if (--this.anchorRefs[i] <= 0) {
            this.anchorObj[i] = null;
            this.anchorRefs[i] = 0;
        }
    }
    markRange(attr, slot, verts) {
        attr.addUpdateRange(slot * VPS * attr.itemSize, verts * attr.itemSize);
        attr.needsUpdate = true;
    }
    takeSlot() {
        let best = -1;
        let bestFade = Infinity;
        for(let i = 0; i < SLOTS; i++){
            const s = this.slots[i];
            if (s.state === 0) return i;
            if (s.state === 2 && s.fade < bestFade) {
                best = i;
                bestFade = s.fade;
            }
        }
        if (best >= 0) {
            this.clearSlot(best);
            return best;
        }
        const old = this.ring.shift();
        this.clearSlot(old);
        return old;
    }
    clearSlot(i) {
        const s = this.slots[i];
        this.ring = this.ring.filter((k)=>k !== i);
        s.binding = undefined;
        this.life[i] = 0;
        if (s.used) {
            this.aPos.array.fill(0, i * VPS * 3, (i * VPS + s.used) * 3);
            this.aMeta.array.fill(0, i * VPS * 4, (i * VPS + s.used) * 4);
            this.markRange(this.aPos, i, s.used);
            this.markRange(this.aMeta, i, s.used);
        }
        this.releaseAnchor(s.anchor);
        s.state = 0;
        s.used = 0;
        s.anchor = 0;
        s.fade = 0;
        this.updateDrawRange();
    }
    updateDrawRange() {
        let hi = -1;
        for(let i = SLOTS - 1; i >= 0; i--)if (this.slots[i].state !== 0) {
            hi = i;
            break;
        }
        this.geo.setDrawRange(0, hi < 0 ? 0 : hi * VPS + this.slots[hi].used);
    }
    write(piece, layer, attachTo, binding, tint = [
        1,
        1,
        1
    ]) {
        let anchor = 0;
        if (attachTo) {
            attachTo.updateMatrixWorld(true);
            anchor = this.anchorFor(attachTo);
            if (anchor < 0) return;
            _m4.copy(attachTo.matrixWorld).invert();
            _n3.getNormalMatrix(_m4);
            for(let k = 0; k < piece.pos.length; k += 3){
                _a.set(piece.pos[k], piece.pos[k + 1], piece.pos[k + 2]).applyMatrix4(_m4);
                piece.pos[k] = _a.x;
                piece.pos[k + 1] = _a.y;
                piece.pos[k + 2] = _a.z;
                _a.set(piece.nor[k], piece.nor[k + 1], piece.nor[k + 2]).applyMatrix3(_n3).normalize();
                piece.nor[k] = _a.x;
                piece.nor[k + 1] = _a.y;
                piece.nor[k + 2] = _a.z;
            }
        }
        const i = this.takeSlot();
        const s = this.slots[i];
        const nv = Math.min(VPS, piece.pos.length / 3);
        const base = i * VPS;
        this.aPos.array.set(piece.pos.slice(0, nv * 3), base * 3);
        this.aNor.array.set(piece.nor.slice(0, nv * 3), base * 3);
        this.aUv.array.set(piece.uv.slice(0, nv * 2), base * 2);
        for(let v = 0; v < nv; v++)this.aTint.array.set([
            ...tint,
            i
        ], (base + v) * 4);
        this.markRange(this.aTint, i, nv);
        if (binding && anchor === 0) {
            const inverse = binding.matrix.clone().invert(), nm = new THREE.Matrix3().getNormalMatrix(inverse);
            binding.localPos = new Float32Array(nv * 3);
            binding.localNor = new Float32Array(nv * 3);
            for(let v = 0; v < nv; v++){
                const k = v * 3, p = new THREE.Vector3().fromArray(piece.pos, k).applyMatrix4(inverse), n = new THREE.Vector3().fromArray(piece.nor, k).applyMatrix3(nm).normalize();
                binding.localPos.set(p.toArray(), k);
                binding.localNor.set(n.toArray(), k);
            }
        }
        s.binding = binding;
        const meta = this.aMeta.array;
        for(let v = 0; v < nv; v++){
            const o = (base + v) * 4;
            meta[o] = layer;
            meta[o + 1] = anchor;
            meta[o + 2] = piece.facing[v];
            meta[o + 3] = 1;
        }
        for (const a of [
            this.aPos,
            this.aNor,
            this.aUv,
            this.aMeta
        ])this.markRange(a, i, nv);
        this.life[i] = 1;
        s.state = 1;
        s.fade = 1;
        s.used = nv;
        s.anchor = anchor;
        if (anchor > 0) this.anchorRefs[anchor]++;
        this.ring.push(i);
        const max = this.maxLive();
        while(this.ring.length > max)this.startFade(this.ring.shift());
        this.updateDrawRange();
    }
    startFade(i) {
        const s = this.slots[i];
        if (s.state === 1) s.state = 2;
    }
    validateSurfaces() {
        for(let i = 0; i < SLOTS; i++){
            const slot = this.slots[i], b = slot.binding;
            if (!slot.state || !b) continue;
            const o = b.owner, source = b.source;
            let alive = topOf(o) === b.root && o.geometry === b.geometry, visible = true;
            for(let p = o; p && alive; p = p.parent){
                if (p.userData.dead || p.userData.destroyed) alive = false;
                if (!p.visible) visible = false;
            }
            this.life[i] = visible ? 1 : 0;
            const inst = source.userData.impactInstance;
            if (inst !== undefined) {
                const im = o;
                if (inst >= im.count) alive = false;
            }
            if (alive) {
                updateSource(source);
                if (Math.abs(source.matrixWorld.determinant()) < 1e-10) alive = false;
            }
            const a = b.geometry.getAttribute('position'), ix = b.geometry.index;
            if (alive && (a !== b.position || ix !== b.index)) alive = false;
            if (alive && (a.version !== b.version || (ix?.version || 0) !== b.indexVersion)) {
                if ((ix?.version || 0) !== b.indexVersion) alive = false;
                for(let k = 0; alive && k < b.proof.length; k += 4){
                    const n = b.proof[k];
                    if (n >= a.count || Math.abs(a.getX(n) - b.proof[k + 1]) + Math.abs(a.getY(n) - b.proof[k + 2]) + Math.abs(a.getZ(n) - b.proof[k + 3]) > 1e-5) alive = false;
                }
                b.version = a.version;
                b.indexVersion = ix?.version || 0;
            }
            if (!alive) {
                this.clearSlot(i);
                continue;
            }
            if (b.localPos && !source.matrixWorld.equals(b.matrix)) {
                if (inst !== undefined) {
                    const d = new THREE.Vector3().setFromMatrixPosition(source.matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(b.matrix));
                    if (d > .5) {
                        this.clearSlot(i);
                        continue;
                    }
                }
                const nm = new THREE.Matrix3().getNormalMatrix(source.matrixWorld), base = i * VPS;
                for(let v = 0; v < slot.used; v++){
                    const k = v * 3, p = new THREE.Vector3().fromArray(b.localPos, k).applyMatrix4(source.matrixWorld), n = new THREE.Vector3().fromArray(b.localNor, k).applyMatrix3(nm).normalize();
                    this.aPos.array.set(p.toArray(), (base + v) * 3);
                    this.aNor.array.set(n.toArray(), (base + v) * 3);
                }
                this.markRange(this.aPos, i, slot.used);
                this.markRange(this.aNor, i, slot.used);
                b.matrix.copy(source.matrixWorld);
            }
        }
    }
    update(dt) {
        this.validateSurfaces();
        const max = this.maxLive();
        while(this.ring.length > max)this.startFade(this.ring.shift());
        const meta = this.aMeta.array;
        for(let i = 0; i < SLOTS; i++){
            const s = this.slots[i];
            if (s.state !== 2) continue;
            s.fade -= dt / FADE_TIME;
            if (s.fade <= 0) {
                this.clearSlot(i);
                continue;
            }
            const a = s.fade * s.fade * (3 - 2 * s.fade);
            const base = i * VPS;
            for(let v = 0; v < s.used; v++)meta[(base + v) * 4 + 3] = a;
            this.markRange(this.aMeta, i, s.used);
        }
    }
    add(point, normal, surface, attachTo, dir, scale = 1, target, tint = [
        1,
        1,
        1
    ], grainWorld) {
        const kind = this.kindOf(surface);
        const R = Math.random;
        const base = scale * (kind === 'concrete' ? 0.13 + R() * 0.07 : kind === 'metal' ? 0.060 + R() * 0.016 : kind === 'wood' ? 0.080 + R() * 0.022 : kind === 'paper' ? 0.040 + R() * 0.012 : kind === 'soil' ? 0.095 + R() * 0.025 : 0.048 + R() * 0.014);
        let stretch = 1;
        let grazing = false;
        const layers = this.layerOf[kind];
        let layer = layers[Math.floor(R() * (layers.length - (kind === 'paper' || kind === 'fabric' ? 0 : 1)))];
        const o = new THREE.Object3D();
        o.quaternion.setFromUnitVectors(Decals.Z, normal);
        if (dir) {
            const cos = Math.abs(dir.dot(normal));
            const t = dir.clone().addScaledVector(normal, -dir.dot(normal));
            if (cos < 0.85 && t.lengthSq() > 1e-6) {
                stretch = Math.min(kind === 'concrete' ? 3 : 2.1, 1 / Math.max(cos, 0.34));
                grazing = cos < 0.42;
                t.normalize();
                const lx = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion);
                const ly = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
                o.rotateZ(Math.atan2(t.dot(ly), t.dot(lx)) + (Math.random() - 0.5) * 0.06);
            } else o.rotateZ(R() * Math.PI * 2);
        } else o.rotateZ(R() * Math.PI * 2);
        if (kind === 'wood' && !grazing) {
            const host = target ?? attachTo;
            const axis = grainWorld ?? host?.userData.grainAxis ?? [
                0,
                1,
                0
            ];
            const grain = new THREE.Vector3().fromArray(axis);
            if (host && !grainWorld) grain.transformDirection(host.matrixWorld);
            grain.addScaledVector(normal, -grain.dot(normal));
            if (grain.lengthSq() < 1e-5) grain.set(0, 0, 1).addScaledVector(normal, -normal.z);
            if (grain.lengthSq() > 1e-5) {
                grain.normalize();
                const lx = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion);
                const ly = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
                o.rotateZ(Math.atan2(grain.dot(ly), grain.dot(lx)) - Math.PI * 0.5);
            }
        }
        if (grazing && (kind === 'concrete' || kind === 'metal' || kind === 'wood' || kind === 'soil')) layer = layers[layers.length - 1];
        const sx = base * (1 + (stretch - 1) * (kind === 'paper' ? 0.5 : 1));
        const front = Math.min(0.02, base * 0.15);
        const back = Math.max(0.03, base * 0.35);
        const piece = this.project(target ?? attachTo, !!attachTo, point, o.quaternion, sx, base, front, back, normal);
        if (piece) {
            const host = target ?? attachTo;
            const binding = host?.isMesh ? captureBinding(host, point, Math.hypot(sx, base, front + back) * .55 + .015) : undefined;
            if (host?.isMesh && !binding) return;
            this.write(piece, layer, attachTo, binding, tint);
        }
    }
    addRubble(floorPoint, floorNormal, target, awayFromWall, k = 1) {
        const layer = this.rubbleLayers[Math.floor(Math.random() * this.rubbleLayers.length)];
        const o = new THREE.Object3D();
        o.quaternion.setFromUnitVectors(Decals.Z, floorNormal);
        const along = new THREE.Vector3().crossVectors(floorNormal, awayFromWall).normalize();
        const lx = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion);
        const ly = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion);
        if (along.lengthSq() > 0.1) o.rotateZ(Math.atan2(along.dot(ly), along.dot(lx)));
        const s = (0.16 + Math.random() * 0.08) * k;
        const piece = this.project(target, false, floorPoint, o.quaternion, s * 1.4, s, 0.015, 0.04, floorNormal);
        if (piece) this.write(piece, layer);
    }
}

globalThis.GBulletImpacts = { Decals };
})(globalThis.THREE);
