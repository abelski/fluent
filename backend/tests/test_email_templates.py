# Unit tests for the Premium-upsell email-copy helpers (plan #18).
from email_templates import append_premium_upsell, build_premium_upsell


# ── build_premium_upsell ──────────────────────────────────────────────────────


def test_generic_ru():
    text = build_premium_upsell("ru", "generic")
    assert "Fluent живёт благодаря поддержке пользователей" in text
    assert "fluent.lt/pricing" in text


def test_generic_en():
    text = build_premium_upsell("en", "generic")
    assert "Fluent runs on user support" in text
    assert "fluent.lt/pricing" in text


def test_convert_ru():
    text = build_premium_upsell("ru", "convert")
    assert "бесплатной неделей Premium" in text
    assert "fluent.lt/pricing" in text


def test_convert_en():
    text = build_premium_upsell("en", "convert")
    assert "free week of Premium" in text
    assert "fluent.lt/pricing" in text


def test_inactive_ru():
    text = build_premium_upsell("ru", "inactive")
    assert "не удаляются за неактивность" in text
    assert "fluent.lt/pricing" in text


def test_inactive_en():
    text = build_premium_upsell("en", "inactive")
    assert "never deleted for inactivity" in text
    assert "fluent.lt/pricing" in text


def test_default_variant_is_generic():
    assert build_premium_upsell("ru") == build_premium_upsell("ru", "generic")
    assert build_premium_upsell("en") == build_premium_upsell("en", "generic")


def test_lang_both_joins_ru_and_en_with_separator():
    for variant in ("generic", "convert", "inactive"):
        combined = build_premium_upsell("both", variant)
        ru = build_premium_upsell("ru", variant)
        en = build_premium_upsell("en", variant)
        assert combined == f"{ru}\n\n— — —\n\n{en}"
        assert combined.startswith(ru)
        assert combined.endswith(en)


# ── append_premium_upsell ─────────────────────────────────────────────────────


def test_append_short_circuits_when_premium():
    body = "Original body"
    assert append_premium_upsell(body, True, "ru", "generic") == body
    assert append_premium_upsell(body, True, "en", "convert") == body
    assert append_premium_upsell(body, True, "both", "inactive") == body


def test_append_adds_upsell_when_not_premium():
    body = "Original body"
    result = append_premium_upsell(body, False, "ru", "generic")
    assert result == f"{body}\n\n{build_premium_upsell('ru', 'generic')}"
    assert result.startswith(body)
    assert "fluent.lt/pricing" in result


def test_append_default_variant_is_generic():
    body = "Body"
    result = append_premium_upsell(body, False, "en")
    assert result == f"{body}\n\n{build_premium_upsell('en', 'generic')}"


def test_append_variant_selection():
    body = "Body"
    convert_result = append_premium_upsell(body, False, "ru", "convert")
    inactive_result = append_premium_upsell(body, False, "ru", "inactive")
    assert convert_result != inactive_result
    assert "бесплатной неделей Premium" in convert_result
    assert "не удаляются за неактивность" in inactive_result
