# 📐 NaviDC OCR Vision Document Parser

> A lightweight 1.2B open-source vision parser built on Qwen2.5-VL that converts camera-captured physical whiteboards, distorted notes, faded receipts, and complex formulas into structured Markdown files.

---

## ⚡ How It Works

| Step 1: Input | Step 2: AI Action | Step 3: Result |
| :--- | :--- | :--- |
| Smartphone snaps of camera-captured documents or whiteboards in `data/` | Geometry-aware CGDP sampling & decoupled structure parsing via NaviDC-OCR | Formatted GitHub-ready Markdown reports saved in `outputs/` |

---

## 🌟 Key Superpowers

- **📐 Physical Whiteboard Parser**: Converts handwritten notes, diagrams, and brainstorming whiteboards into clean Markdown.
- **📊 Table & Formula Specialist**: Parses complex merged tables into OTSL HTML/Markdown and formulas into LaTeX notation.
- **🌀 Deformation Recovery**: Handles curved, angled, crumpled, and camera-captured pages without dewarping preprocessing.
- **🔒 100% Offline & Private**: Runs locally on modest GPU or CPU hardware without sending confidential documents to third-party cloud servers.
- **⚡ Lightweight 1.2B Architecture**: High speed, low VRAM footprint, compatible with Hugging Face, vLLM, and SGLang.

---

## 🛠️ Technology Stack

- **Primary Vision-Language Model**: StarDoc-AI/NaviDC-OCR (~1.2B parameters)
- **Base Architecture**: Qwen2.5-VL Multi-Modal Framework
- **Execution Script**: Python CLI Core (`main.py`)
- **Machine Learning Core**: PyTorch, Hugging Face Transformers, Accelerate
- **Image Processing**: Pillow

---

## 📁 Repository Structure

```text
NaviDC-OCR/
├── main.py
├── data/
│   ├── camera_document.png
│   ├── scientific_figure.png
│   ├── formula.png
│   └── table.png
├── outputs/
│   ├── camera_document_parsed.md
│   └── scientific_figure_parsed.md
├── requirements.txt
└── README.md
```

---

## 🚀 Quick Setup & Usage Instructions

### 1. Install Dependencies

```powershell
pip install -r requirements.txt
```

### 2. Download NaviDC-OCR Model Weights

```powershell
# Download using Python huggingface_hub
python -c "from huggingface_hub import snapshot_download; snapshot_download('StarDoc-AI/NaviDC-OCR', local_dir='../models/NaviDC-OCR')"
```

### 3. Process All Sample Documents in `data/`

```powershell
python main.py
```

Running `python main.py` automatically iterates through all images in `data/` and saves structured Markdown outputs inside `outputs/`.

