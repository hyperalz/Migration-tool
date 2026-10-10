#!/usr/bin/env python3
"""Calculate readability scores for the landing page."""

import re
import textstat

# Read the HTML file
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Extract hero text (between <header class="hero"> and </header>)
hero_match = re.search(r'<header class="hero">(.*?)</header>', html, re.DOTALL)
if hero_match:
    hero_html = hero_match.group(1)
else:
    hero_html = ""

# Extract all text content (remove HTML tags)
def extract_text(html_content):
    # Remove script and style tags
    text = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Remove HTML comments
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

hero_text = extract_text(hero_html)
full_text = extract_text(html)

print("="*60)
print("READABILITY SCORES FOR LANDING PAGE")
print("="*60)
print()

print("HERO SECTION")
print("-"*60)
print(f"Text length: {len(hero_text)} characters")
print(f"Word count: {len(hero_text.split())} words")
print()
print(f"Flesch Reading Ease: {textstat.flesch_reading_ease(hero_text):.1f}")
print(f"  (0-30: Very Difficult, 30-50: Difficult, 50-60: Fairly Difficult,")
print(f"   60-70: Standard, 70-80: Fairly Easy, 80-90: Easy, 90-100: Very Easy)")
print()
print(f"Flesch-Kincaid Grade: {textstat.flesch_kincaid_grade(hero_text):.1f}")
print(f"  (US grade level - target 9-11 for GOV.UK style)")
print()
print(f"Reading age: ~{int(textstat.flesch_kincaid_grade(hero_text)) + 5} years old")
print()

print("="*60)
print("FULL PAGE")
print("-"*60)
print(f"Text length: {len(full_text)} characters")
print(f"Word count: {len(full_text.split())} words")
print()
print(f"Flesch Reading Ease: {textstat.flesch_reading_ease(full_text):.1f}")
print(f"  (0-30: Very Difficult, 30-50: Difficult, 50-60: Fairly Difficult,")
print(f"   60-70: Standard, 70-80: Fairly Easy, 80-90: Easy, 90-100: Very Easy)")
print()
print(f"Flesch-Kincaid Grade: {textstat.flesch_kincaid_grade(full_text):.1f}")
print(f"  (US grade level - target 9-11 for GOV.UK style)")
print()
print(f"Reading age: ~{int(textstat.flesch_kincaid_grade(full_text)) + 5} years old")
print()

print("="*60)
print("ASSESSMENT")
print("="*60)

hero_grade = textstat.flesch_kincaid_grade(hero_text)
full_grade = textstat.flesch_kincaid_grade(full_text)

if hero_grade <= 11:
    print("✓ Hero section: PASSES plain-English test (reading age 9-11 target)")
else:
    print(f"✗ Hero section: Grade {hero_grade:.1f} is above target (reading age {int(hero_grade) + 5})")

if full_grade <= 11:
    print("✓ Full page: PASSES plain-English test (reading age 9-11 target)")
else:
    print(f"✗ Full page: Grade {full_grade:.1f} is above target (reading age {int(full_grade) + 5})")

print()
