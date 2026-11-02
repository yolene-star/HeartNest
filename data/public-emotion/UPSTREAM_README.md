---
license: mit
task_categories:
- text-classification
- text-generation
- fill-mask
language:
- zh
tags:
- emotion
- conversation
size_categories:
- 1K<n<10K
---
# Chinese_Multi-Emotion_Dialogue_Dataset

## 📄 Description
This dataset contains **4159 Chinese dialogues** annotated with **8 distinct emotion categories**. The data is suitable for emotion recognition, sentiment analysis, and other NLP tasks involving Chinese text.

### Data Sources:
- **Daily Conversations**: Captured from natural, informal human conversations.
- **Movie Dialogues**: Extracted from diverse Chinese-language movies.
- **AI-Generated Dialogues**: Synthesized using advanced natural language models.
- All dialogues were **manually annotated** for emotion categories by a team of experts to ensure high-quality labeling.

### Emotion Categories:
- 平淡語氣 (Neutral)
- 開心語調 (Joy)
- 悲傷語調 (Sadness)
- 憤怒語調 (Anger)
- 驚訝語調 (Surprise)
- 恐懼語調 (Fear)
- 厭惡語調 (Disgust)
- 疑問語調 (Confuse)

---

## 📂 Dataset Structure
The dataset is in **CSV format** and includes the following columns:

| Column  | Description                       |
|---------|-----------------------------------|
| `text`  | Dialogue content in Chinese      |
| `emotion` | Annotated emotion category      |

### Example Entries:
| text                          | emotion   |
|-------------------------------|-----------|
| 你要不要去吃午餐？                | 平淡語氣  |
| 誒誒誒！我甄選上了！               | 開心語調  |
| 我幾天身體好像有點不太舒服，肚子好痛 | 悲傷語調  |

---

## 📊 Statistics
- **Total Records**: 4159
- **Unique Emotions**: 8
- **Emotion Distribution**:
  - 平淡語氣: 705
  - 開心語調: 592
  - 悲傷語調: 560
  - 憤怒語調: 527
  - 驚奇語調: 499
  - 悲傷語調: 486
  - 厭惡語調: 404
  - 疑問語調: 386


---

## 📥 Download and Usage
This dataset is provided in CSV format and can be loaded easily for analysis or model training. Example:

```python
from datasets import load_dataset

ds = load_dataset("Johnson8187/Chinese_Multi-Emotion_Dialogue_Dataset")
```
---

## Citation

```bibtex
@misc{lin2024chinese_medd,
  author = {Lin, Cheng-Yen},
  title = {Chinese Multi-Emotion Dialogue Dataset (Chinese-MEDD)},
  year = {2024},
  publisher = {Hugging Face},
  journal = {Hugging Face repository},
  howpublished = {\url{https://huggingface.co/datasets/Johnson8187/Chinese_Multi-Emotion_Dialogue_Dataset}}
}
```
---
