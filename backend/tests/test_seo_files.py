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
