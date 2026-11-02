from public_classification import prepare


def test_cleaning_removes_duplicate_empty_and_conflicting_texts():
    rows = [{'text': ' 开心！ ', 'emotion': '开心'}, {'text': '开心！', 'emotion': '开心'},
            {'text': '同一句', 'emotion': '平淡'}, {'text': '同一句', 'emotion': '悲伤'},
            {'text': ' ', 'emotion': '开心'}]
    clean, audit = prepare(rows)
    assert clean == [('开心!', '开心')]
    assert audit['conflicting_texts_removed'] == 1
    assert audit['empty_rows_removed'] == 1
