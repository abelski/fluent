"""#62a — robots.txt keeps the knowledge check private; llms.txt lists it as a feature."""


def test_robots_disallows_check(client):
    r = client.get("/robots.txt")
    assert r.status_code == 200
    assert "Disallow: /dashboard/check/\n" in r.text
    assert "Disallow: /dashboard/review/\n" in r.text


def test_llms_lists_knowledge_check(client):
    r = client.get("/llms.txt")
    assert r.status_code == 200
    assert "- Free knowledge check with a gap analysis; Premium builds lessons from your mistakes (sign-in required)" in r.text


def test_llms_lists_published_practice_category_only(client):
    """#62b — llms.txt lists a practice category only once a guest could see it."""
    from sqlmodel import Session, select
    from conftest import _test_engine
    from models import PracticeCategory, PracticeTest

    with Session(_test_engine) as s:
        pub = PracticeCategory(name_ru="SEO pub", name_en="SEO Published Cat", sort_order=9300)
        hid = PracticeCategory(name_ru="SEO hid", name_en="SEO Hidden Cat", sort_order=9301)
        s.add(pub)
        s.add(hid)
        s.commit()
        s.add(PracticeTest(category_id=pub.id, title_ru="p", status="published"))
        s.add(PracticeTest(category_id=pub.id, title_ru="t", status="testing"))
        s.add(PracticeTest(category_id=hid.id, title_ru="h", status="testing"))
        s.commit()
        cat_ids = [pub.id, hid.id]
    try:
        text = client.get("/llms.txt").text
        assert "## Exam-format practice" in text
        assert "- SEO Published Cat (1 test)" in text
        assert "SEO Hidden Cat" not in text
    finally:
        with Session(_test_engine) as s:
            for t in s.exec(select(PracticeTest).where(PracticeTest.category_id.in_(cat_ids))).all():
                s.delete(t)
            for cid in cat_ids:
                s.delete(s.get(PracticeCategory, cid))
            s.commit()
