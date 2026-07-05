"""Детектор коллизий справочников (04.07, adversarial review): name_ru/name_en одной
канонической сущности не должен быть алиасом другой — иначе first-wins делает узел
мёртвым (его поверхность резолвится в чужой canonical_id, факты уходят не туда).
"""

from __future__ import annotations

from app.ingest.canonizer import Canonizer


def test_no_canonical_surface_captured_by_other_alias():
    """Ни одно каноническое name_ru/name_en не перехвачено алиасом другого узла."""
    c = Canonizer()
    problems: list[str] = []
    for label in ("Material", "Process", "Equipment", "Parameter"):
        for ent in c.entities(label):
            for surface in (ent.name_ru, ent.name_en):
                if not surface:
                    continue
                hit = c.lookup(surface, label)
                # Собственная поверхность должна резолвиться в СВОЙ узел.
                if hit is not None and hit.canonical_id != ent.canonical_id:
                    problems.append(
                        f"{label}: {ent.canonical_id!r} name {surface!r} → "
                        f"перехвачен {hit.canonical_id!r}"
                    )
    assert not problems, "коллизии справочника:\n" + "\n".join(problems)
