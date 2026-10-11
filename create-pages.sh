#!/bin/bash

# Create basic page template function
create_page() {
  local filename=$1
  local title=$2
  local h1=$3
  local description=$4
  
  cat > "$filename" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <title>TITLE_PLACEHOLDER</title>
  <meta name="description" content="DESC_PLACEHOLDER">
  
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🔀</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>

  <!-- Navigation -->
  <nav>
    <div class="wrap nav-inner">
      <a href="index.html" class="logo">
        <div class="logo-mark">FW</div>
        Foam Works Digital
      </a>
      <div class="nav-links" id="nav-links">
        <a href="how-we-work.html">How we work</a>
        <a href="mapbridge.html">MapBridge</a>
        <a href="case-studies.html">Case studies</a>
        <a href="it-and-dpo.html">For IT & DPOs</a>
        <a href="about.html">About</a>
        <a href="https://www.linkedin.com/in/alexosfwd/" class="btn btn-primary" style="margin-left: 1rem;">Book a 30-min call</a>
      </div>
      <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Menu">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
    </div>
  </nav>

  <!-- Content -->
  <section class="section-white">
    <div class="wrap">
      <h1>H1_PLACEHOLDER</h1>
      <p class="lead">This page is under construction and will be expanded with full content soon.</p>
      <p><a href="index.html" class="btn btn-primary">← Back to home</a></p>
    </div>
  </section>

  <!-- Footer -->
  <footer>
    <div class="wrap footer-inner">
      <div>© 2026 Foam Works Digital</div>
      <div class="footer-links">
        <a href="how-we-work.html">How we work</a>
        <a href="mapbridge.html">MapBridge</a>
        <a href="case-studies.html">Case studies</a>
        <a href="it-and-dpo.html">For IT & DPOs</a>
        <a href="about.html">About</a>
        <a href="app.html">Open the tool</a>
      </div>
    </div>
  </footer>

  <script>
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.getElementById('nav-links');
    
    if (mobileMenuBtn && navLinks) {
      mobileMenuBtn.addEventListener('click', () => {
        navLinks.classList.toggle('active');
      });
      
      navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          navLinks.classList.remove('active');
        });
      });
    }
  </script>
</body>
</html>
EOF

  # Replace placeholders
  sed -i "s/TITLE_PLACEHOLDER/$title/" "$filename"
  sed -i "s/H1_PLACEHOLDER/$h1/" "$filename"
  sed -i "s/DESC_PLACEHOLDER/$description/" "$filename"
}

# Create all pages
create_page "how-we-work.html" "How We Work — Foam Works Digital" "How we work" "Our five-stage approach to system change: from contract ending to signed-off proof after go-live."

create_page "case-studies.html" "Case Studies — Foam Works Digital" "Case studies" "Real council system change projects: what happened, what we learned, and the results."

create_page "contact.html" "Contact — Foam Works Digital" "Get in touch" "Book a 30-minute call to discuss your system change project."

echo "Created placeholder pages"
