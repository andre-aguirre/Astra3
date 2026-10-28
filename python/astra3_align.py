# ============================================================
# astra3_align.py
# Astra3: Structural Analysis Toolkit for PDB Rendering Automation
# Created by Andre Aguirre
# Copyright (c) 2026 Andre Aguirre
# Licensed under the GNU General Public License, version 3 or later (GPL-3.0-or-later).
# See LICENSE file for details.
# ============================================================
#
# Gap-aware sequence comparison for whole-structure identity.
#
# Design constraints, and why each matters for real crystal structures:
#
#   Terminal gaps are free. Two crystals of the same protein routinely
#   resolve different amounts of the N/C tail, and expression constructs add
#   tags and cloning scars. Penalising terminal gaps would report the same
#   protein as divergent because one crystal resolved four more residues.
#
#   Gaps are affine (Gotoh). A six-residue loop insertion is one event, not
#   six. A linear penalty charges it six times and pushes the aligner toward
#   scattering single-residue gaps rather than one clean block.
#
#   Scoring uses BLOSUM62. I->L, D->E, K->R, S->T and F->Y are conservative
#   substitutions: similar volume, charge or polarity, usually structurally
#   silent. Treating them identically to W->P misrepresents relatedness, so
#   similarity is reported alongside strict identity.
#
#   Identity is reported two ways. Over aligned columns is the conventional
#   figure; over the shorter sequence is the one that is safe to act on,
#   because a semi-global aligner can always find some short high-scoring
#   segment between unrelated proteins and report a respectable identity
#   across it.
#
# The previous method compared residues position-by-position with a bounded
# N-terminal offset search. It cannot represent an internal insertion or
# deletion at all: one indel desynchronises every subsequent position and
# collapses a true homolog toward chance identity.
# ============================================================

_B62_ORDER = "ARNDCQEGHILKMFPSTWYVBZX*"
_B62_ROWS = """
 4 -1 -2 -2  0 -1 -1  0 -2 -1 -1 -1 -1 -2 -1  1  0 -3 -2  0 -2 -1  0 -4
-1  5  0 -2 -3  1  0 -2  0 -3 -2  2 -1 -3 -2 -1 -1 -3 -2 -3 -1  0 -1 -4
-2  0  6  1 -3  0  0  0  1 -3 -3  0 -2 -3 -2  1  0 -4 -2 -3  3  0 -1 -4
-2 -2  1  6 -3  0  2 -1 -1 -3 -4 -1 -3 -3 -1  0 -1 -4 -3 -3  4  1 -1 -4
 0 -3 -3 -3  9 -3 -4 -3 -3 -1 -1 -3 -1 -2 -3 -1 -1 -2 -2 -1 -3 -3 -2 -4
-1  1  0  0 -3  5  2 -2  0 -3 -2  1  0 -3 -1  0 -1 -2 -1 -2  0  3 -1 -4
-1  0  0  2 -4  2  5 -2  0 -3 -3  1 -2 -3 -1  0 -1 -3 -2 -2  1  4 -1 -4
 0 -2  0 -1 -3 -2 -2  6 -2 -4 -4 -2 -3 -3 -2  0 -2 -2 -3 -3 -1 -2 -1 -4
-2  0  1 -1 -3  0  0 -2  8 -3 -3 -1 -2 -1 -2 -1 -2 -2  2 -3  0  0 -1 -4
-1 -3 -3 -3 -1 -3 -3 -4 -3  4  2 -3  1  0 -3 -2 -1 -3 -1  3 -3 -3 -1 -4
-1 -2 -3 -4 -1 -2 -3 -4 -3  2  4 -2  2  0 -3 -2 -1 -2 -1  1 -4 -3 -1 -4
-1  2  0 -1 -3  1  1 -2 -1 -3 -2  5 -1 -3 -1  0 -1 -3 -2 -2  0  1 -1 -4
-1 -1 -2 -3 -1  0 -2 -3 -2  1  2 -1  5  0 -2 -1 -1 -1 -1  1 -3 -1 -1 -4
-2 -3 -3 -3 -2 -3 -3 -3 -1  0  0 -3  0  6 -4 -2 -2  1  3 -1 -3 -3 -1 -4
-1 -2 -2 -1 -3 -1 -1 -2 -2 -3 -3 -1 -2 -4  7 -1 -1 -4 -3 -2 -2 -1 -2 -4
 1 -1  1  0 -1  0  0  0 -1 -2 -2  0 -1 -2 -1  4  1 -3 -2 -2  0  0  0 -4
 0 -1  0 -1 -1 -1 -1 -2 -2 -1 -1 -1 -1 -2 -1  1  5 -2 -2  0 -1 -1  0 -4
-3 -3 -4 -4 -2 -2 -3 -2 -2 -3 -2 -3 -1  1 -4 -3 -2 11  2 -3 -4 -3 -2 -4
-2 -2 -2 -3 -2 -1 -2 -3  2 -1 -1 -2 -1  3 -3 -2 -2  2  7 -1 -3 -2 -1 -4
 0 -3 -3 -3 -1 -2 -2 -3 -3  3  1 -2  1 -1 -2 -2  0 -3 -1  4 -3 -2 -1 -4
-2 -1  3  4 -3  0  1 -1  0 -3 -4  0 -3 -3 -2  0 -1 -4 -3 -3  4  1 -1 -4
-1  0  0  1 -3  3  4 -2  0 -3 -3  1 -1 -3 -1  0 -1 -3 -2 -2  1  4 -1 -4
 0 -1 -1 -1 -2 -1 -1 -1 -1 -1 -1 -1 -1 -1 -2  0  0 -2 -1 -1 -1 -1 -1 -4
-4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4 -4  1
"""

BLOSUM62 = {}
for _i, _line in enumerate(r for r in _B62_ROWS.strip().split("\n")):
    for _j, _v in enumerate(_line.split()):
        BLOSUM62[(_B62_ORDER[_i], _B62_ORDER[_j])] = int(_v)


def _score(a, b):
    v = BLOSUM62.get((a, b))
    if v is not None:
        return v
    # Unknown or non-standard residue: neutral-to-slightly-negative, the
    # same treatment BLOSUM gives X, so an unmodelled residue neither
    # rewards nor heavily punishes.
    return -1


GAP_OPEN = 11      # BLOSUM62's standard companion penalties
GAP_EXTEND = 1


def kmer_containment(seq_a, seq_b, k=3):
    """Fraction of the shorter sequence's k-mers that occur in the longer.

    A cheap O(n+m) screen. Unrelated proteins share few 3-mers beyond
    background; homologs share many even across substantial divergence. Used
    only to skip full alignment for pairs that cannot plausibly be related,
    so its threshold is set deliberately low.
    """
    if len(seq_a) < k or len(seq_b) < k:
        return 0.0
    short, long_ = (seq_a, seq_b) if len(seq_a) <= len(seq_b) else (seq_b, seq_a)
    long_kmers = {long_[i:i + k] for i in range(len(long_) - k + 1)}
    short_kmers = [short[i:i + k] for i in range(len(short) - k + 1)]
    if not short_kmers:
        return 0.0
    hits = sum(1 for km in short_kmers if km in long_kmers)
    return hits / len(short_kmers)


def align(seq_a, seq_b, free_end_gaps=True):
    """Affine-gap alignment. Returns (aligned_a, aligned_b, score).

    Terminal gaps are free by default: differing amounts of resolved or
    constructed terminus are an artefact of crystallography and cloning, not
    evidence that two proteins differ.

    Uses the numpy implementation when numpy is available (it always is in
    PyMOL and ChimeraX); it fills the same matrices with the same tie rules,
    so both give the same alignment. The pure-Python version below remains
    the reference and the fallback.
    """
    if _np is not None and len(seq_a) and len(seq_b):
        return _align_numpy(seq_a, seq_b, free_end_gaps)
    return _align_python(seq_a, seq_b, free_end_gaps)


def _align_python(seq_a, seq_b, free_end_gaps=True):
    n, m = len(seq_a), len(seq_b)
    if n == 0 or m == 0:
        return "-" * m if n == 0 else seq_a, seq_b if n == 0 else "-" * n, 0

    NEG = float("-inf")
    # M: ends aligned; Ix: gap in b (consumes a); Iy: gap in a (consumes b)
    M = [[NEG] * (m + 1) for _ in range(n + 1)]
    Ix = [[NEG] * (m + 1) for _ in range(n + 1)]
    Iy = [[NEG] * (m + 1) for _ in range(n + 1)]
    ptrM = [[0] * (m + 1) for _ in range(n + 1)]
    ptrX = [[0] * (m + 1) for _ in range(n + 1)]
    ptrY = [[0] * (m + 1) for _ in range(n + 1)]

    M[0][0] = 0
    for i in range(1, n + 1):
        Ix[i][0] = 0 if free_end_gaps else -GAP_OPEN - (i - 1) * GAP_EXTEND
        ptrX[i][0] = 1
    for j in range(1, m + 1):
        Iy[0][j] = 0 if free_end_gaps else -GAP_OPEN - (j - 1) * GAP_EXTEND
        ptrY[0][j] = 2

    for i in range(1, n + 1):
        ai = seq_a[i - 1]
        for j in range(1, m + 1):
            sc = _score(ai, seq_b[j - 1])
            best, ptr = M[i - 1][j - 1], 0
            if Ix[i - 1][j - 1] > best:
                best, ptr = Ix[i - 1][j - 1], 1
            if Iy[i - 1][j - 1] > best:
                best, ptr = Iy[i - 1][j - 1], 2
            M[i][j] = best + sc
            ptrM[i][j] = ptr

            open_x = M[i - 1][j] - GAP_OPEN
            ext_x = Ix[i - 1][j] - GAP_EXTEND
            if open_x >= ext_x:
                Ix[i][j], ptrX[i][j] = open_x, 0
            else:
                Ix[i][j], ptrX[i][j] = ext_x, 1

            open_y = M[i][j - 1] - GAP_OPEN
            ext_y = Iy[i][j - 1] - GAP_EXTEND
            if open_y >= ext_y:
                Iy[i][j], ptrY[i][j] = open_y, 0
            else:
                Iy[i][j], ptrY[i][j] = ext_y, 2

    # Free end gaps: the alignment may finish anywhere along the final row or
    # column, whichever scores best.
    ei, ej, state, best = n, m, 0, M[n][m]
    for cand, st in ((Ix[n][m], 1), (Iy[n][m], 2)):
        if cand > best:
            best, state = cand, st
    if free_end_gaps:
        for i in range(n + 1):
            for val, st in ((M[i][m], 0), (Ix[i][m], 1), (Iy[i][m], 2)):
                if val > best:
                    best, ei, ej, state = val, i, m, st
        for j in range(m + 1):
            for val, st in ((M[n][j], 0), (Ix[n][j], 1), (Iy[n][j], 2)):
                if val > best:
                    best, ei, ej, state = val, n, j, st

    out_a, out_b = [], []
    # Trailing unaligned tail, emitted as free end gaps.
    for i in range(n, ei, -1):
        out_a.append(seq_a[i - 1]); out_b.append("-")
    for j in range(m, ej, -1):
        out_a.append("-"); out_b.append(seq_b[j - 1])

    i, j = ei, ej
    while i > 0 or j > 0:
        if state == 0:
            if i == 0 or j == 0:
                break
            out_a.append(seq_a[i - 1]); out_b.append(seq_b[j - 1])
            state = ptrM[i][j]; i -= 1; j -= 1
        elif state == 1:
            if i == 0:
                break
            out_a.append(seq_a[i - 1]); out_b.append("-")
            state = ptrX[i][j]; i -= 1
        else:
            if j == 0:
                break
            out_a.append("-"); out_b.append(seq_b[j - 1])
            state = ptrY[i][j]; j -= 1
    while i > 0:
        out_a.append(seq_a[i - 1]); out_b.append("-"); i -= 1
    while j > 0:
        out_a.append("-"); out_b.append(seq_b[j - 1]); j -= 1

    return "".join(reversed(out_a)), "".join(reversed(out_b)), best


try:
    import numpy as _np
except Exception:  # noqa: BLE001 -- the pure-Python aligner still works
    _np = None


def _score_matrix(seq_a, seq_b):
    letters = sorted(set(seq_a) | set(seq_b))
    index = {c: k for k, c in enumerate(letters)}
    table = _np.array([[_score(x, y) for y in letters] for x in letters], dtype=_np.float64)
    ia = _np.array([index[c] for c in seq_a])
    ib = _np.array([index[c] for c in seq_b])
    return table[ia][:, ib]


def _align_numpy(seq_a, seq_b, free_end_gaps=True):
    """Same recurrences as _align_python, one row at a time. Within a row the
    gap-in-a state depends on its left neighbour; with affine penalties that
    is a running maximum, Iy[j] = max_k<j (M[k] - open - (j-1-k) * extend),
    computed with maximum.accumulate. Scores are integers, so comparisons and
    ties are exact."""
    n, m = len(seq_a), len(seq_b)
    NEG = -_np.inf
    S = _score_matrix(seq_a, seq_b)
    M = _np.full((n + 1, m + 1), NEG)
    Ix = _np.full((n + 1, m + 1), NEG)
    Iy = _np.full((n + 1, m + 1), NEG)
    ptrM = _np.zeros((n + 1, m + 1), dtype=_np.int8)
    ptrX = _np.zeros((n + 1, m + 1), dtype=_np.int8)
    ptrY = _np.zeros((n + 1, m + 1), dtype=_np.int8)
    M[0, 0] = 0
    k = _np.arange(1, n + 1)
    Ix[1:, 0] = 0 if free_end_gaps else -GAP_OPEN - (k - 1) * GAP_EXTEND
    ptrX[1:, 0] = 1
    k = _np.arange(1, m + 1)
    Iy[0, 1:] = 0 if free_end_gaps else -GAP_OPEN - (k - 1) * GAP_EXTEND
    ptrY[0, 1:] = 2
    cols = _np.arange(m + 1, dtype=_np.float64)
    for i in range(1, n + 1):
        pm, px, py = M[i - 1, :-1], Ix[i - 1, :-1], Iy[i - 1, :-1]
        best = pm.copy()
        ptr = _np.zeros(m, dtype=_np.int8)
        sel = px > best
        best[sel] = px[sel]; ptr[sel] = 1
        sel = py > best
        best[sel] = py[sel]; ptr[sel] = 2
        M[i, 1:] = best + S[i - 1]
        ptrM[i, 1:] = ptr

        open_x = M[i - 1, 1:] - GAP_OPEN
        ext_x = Ix[i - 1, 1:] - GAP_EXTEND
        take_ext = ext_x > open_x
        Ix[i, 1:] = _np.where(take_ext, ext_x, open_x)
        ptrX[i, 1:] = _np.where(take_ext, 1, 0)

        shifted = M[i, :-1] + cols[:-1] * GAP_EXTEND
        running = _np.maximum.accumulate(shifted)
        Iy[i, 1:] = running - GAP_OPEN - cols[:-1] * GAP_EXTEND
        Iy[i, 1:] = _np.maximum(Iy[i, 1:], Iy[i, 0] - GAP_EXTEND * cols[1:])
        open_y = M[i, :-1] - GAP_OPEN
        ext_y = Iy[i, :-1] - GAP_EXTEND
        ptrY[i, 1:] = _np.where(ext_y > open_y, 2, 0)

    ei, ej, state, best = n, m, 0, M[n, m]
    for cand, st in ((Ix[n, m], 1), (Iy[n, m], 2)):
        if cand > best:
            best, state = cand, st
    if free_end_gaps:
        for i in range(n + 1):
            for val, st in ((M[i, m], 0), (Ix[i, m], 1), (Iy[i, m], 2)):
                if val > best:
                    best, ei, ej, state = val, i, m, st
        for j in range(m + 1):
            for val, st in ((M[n, j], 0), (Ix[n, j], 1), (Iy[n, j], 2)):
                if val > best:
                    best, ei, ej, state = val, n, j, st

    out_a, out_b = [], []
    for i in range(n, ei, -1):
        out_a.append(seq_a[i - 1]); out_b.append("-")
    for j in range(m, ej, -1):
        out_a.append("-"); out_b.append(seq_b[j - 1])
    i, j = ei, ej
    while i > 0 or j > 0:
        if state == 0:
            if i == 0 or j == 0:
                break
            out_a.append(seq_a[i - 1]); out_b.append(seq_b[j - 1])
            state = int(ptrM[i, j]); i -= 1; j -= 1
        elif state == 1:
            if i == 0:
                break
            out_a.append(seq_a[i - 1]); out_b.append("-")
            state = int(ptrX[i, j]); i -= 1
        else:
            if j == 0:
                break
            out_a.append("-"); out_b.append(seq_b[j - 1])
            state = int(ptrY[i, j]); j -= 1
    while i > 0:
        out_a.append(seq_a[i - 1]); out_b.append("-"); i -= 1
    while j > 0:
        out_a.append("-"); out_b.append(seq_b[j - 1]); j -= 1
    score = best.item() if hasattr(best, "item") else best
    if score == int(score):
        score = int(score)
    return "".join(reversed(out_a)), "".join(reversed(out_b)), score


def compare(seq_a, seq_b, prescreen=True):
    """Full comparison. Returns a dict of interpretable metrics."""
    result = {
        "identity": 0.0, "identity_over_shorter": 0.0, "similarity": 0.0,
        "coverage": 0.0, "coverage_a": 0.0, "coverage_b": 0.0,
        "aligned_columns": 0, "gap_openings": 0, "gap_residues": 0,
        "largest_indel": 0, "substitutions": 0, "conservative_substitutions": 0,
        "screened_out": False, "kmer_containment": 0.0,
    }
    if not seq_a or not seq_b:
        return result

    containment = kmer_containment(seq_a, seq_b)
    result["kmer_containment"] = containment
    # The screen is a statistical statement about k-mer sharing and says
    # nothing meaningful about very short sequences, where a handful of
    # residues cannot produce a representative k-mer profile. Below this
    # length the full alignment is cheap anyway, so it simply always runs.
    shortest = min(len(seq_a), len(seq_b))
    # Threshold set well below anything a real homolog produces; its job is
    # only to avoid full DP on pairs that share essentially nothing.
    if prescreen and shortest >= 25 and containment < 0.02:
        result["screened_out"] = True
        return result

    aln_a, aln_b, _ = align(seq_a, seq_b)

    matches = sim = cols = subs = cons = 0
    gap_open = gap_res = 0
    cur_gap = largest = 0
    in_gap = False
    for ca, cb in zip(aln_a, aln_b):
        if ca == "-" or cb == "-":
            gap_res += 1
            if not in_gap:
                gap_open += 1
                in_gap = True
                cur_gap = 1
            else:
                cur_gap += 1
            largest = max(largest, cur_gap)
            continue
        in_gap = False
        cols += 1
        if ca == cb:
            matches += 1
            sim += 1
        else:
            subs += 1
            if _score(ca, cb) >= 0:
                sim += 1
                cons += 1

    # Terminal gaps are free and must not count as internal indels: they are
    # the expected consequence of differing terminal resolution.
    def _trim_terminal(a, b):
        start, end = 0, len(a)
        while start < end and (a[start] == "-" or b[start] == "-"):
            start += 1
        while end > start and (a[end - 1] == "-" or b[end - 1] == "-"):
            end -= 1
        return a[start:end], b[start:end]

    core_a, core_b = _trim_terminal(aln_a, aln_b)
    internal_open = internal_res = 0
    cur = 0
    in_g = False
    internal_largest = 0
    for ca, cb in zip(core_a, core_b):
        if ca == "-" or cb == "-":
            internal_res += 1
            if not in_g:
                internal_open += 1; in_g = True; cur = 1
            else:
                cur += 1
            internal_largest = max(internal_largest, cur)
        else:
            in_g = False

    result.update({
        # Identity over the aligned columns is the conventional figure, but
        # on its own it is misleading: a semi-global aligner can always find
        # some short, high-scoring segment between two unrelated proteins and
        # report a respectable identity across it. identity_over_shorter
        # divides by the length of the shorter sequence instead, so an
        # alignment that covers very little of either protein cannot look
        # like a good match no matter how well that fragment scores. This is
        # the figure to warn on.
        "identity": matches / cols if cols else 0.0,
        "identity_over_shorter": matches / min(len(seq_a), len(seq_b)),
        "similarity": sim / cols if cols else 0.0,
        "coverage": cols / max(len(seq_a), len(seq_b)),
        # Per-sequence coverage: a 30-column alignment covers a 40-residue
        # terminus well and a 400-residue chain barely at all. One combined
        # figure hides that asymmetry.
        "coverage_a": cols / len(seq_a),
        "coverage_b": cols / len(seq_b),
        "aligned_columns": cols,
        "gap_openings": internal_open,
        "gap_residues": internal_res,
        "largest_indel": internal_largest,
        "substitutions": subs,
        "conservative_substitutions": cons,
    })
    return result


def aligned_pairs(seq_a, seq_b):
    """Index pairs (i, j) for every column where both sequences have a
    residue, i.e. the correspondence the alignment establishes.

    This is what downstream structural work needs. Pairing residue N of one
    structure with residue N of another -- whether by list position or by
    residue number -- assumes the two share a numbering or have no indels
    between them. Neither holds across independently deposited entries. An
    insertion shifts every subsequent residue, so the correspondence has to
    come from the alignment itself:

        A: A K L G T - E F L
        B: A K L G T R E F L
                     ^ insertion in B

    Column 5 pairs nothing; columns 6-8 pair A's E,F,L with B's E,F,L, which
    positional pairing would have offset by one.
    """
    aln_a, aln_b, _ = align(seq_a, seq_b)
    pairs = []
    i = j = 0
    for ca, cb in zip(aln_a, aln_b):
        if ca != "-" and cb != "-":
            pairs.append((i, j))
        if ca != "-":
            i += 1
        if cb != "-":
            j += 1
    return pairs


def homology_threshold(aligned_length):
    """Percent identity at or above which an alignment of this many residue
    pairs indicates the two proteins share a fold: the HSSP threshold of
    Sander C, Schneider R (1991) Proteins 9:56-68, t(L) = 290.15 L^-0.562,
    held constant beyond 80 residues. It exceeds 100% below 7 pairs, so a
    handful of matching residues never counts as a correspondence."""
    if aligned_length <= 0:
        return float("inf")
    return 290.15 * min(aligned_length, 80) ** -0.562
