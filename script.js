/**
 * IBS Website Global JavaScript
 * Features: Mobile nav, smooth scroll, animations, form validation, dark mode, services tabs, testimonials slider
 */

document.addEventListener('DOMContentLoaded', function() {
  // Mobile Nav Toggle
  const hamburger = document.querySelector('.hamburger');
  const navMenu = document.querySelector('.nav-menu');
  
  if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navMenu.classList.toggle('active');
    });
    
    // Close menu on link click
    document.querySelectorAll('.nav-menu a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
      });
    });
  }

  // Smooth Scrolling
  document.querySelectorAll('a[href^=\"#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Scroll Reveal Animation
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-fadeInUp');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    observer.observe(el);
  });

  // Contact Form Validation & Submit
  const contactForm = document.querySelector('form[action="send_email.php"]');
  if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
      const name = this.querySelector('input[name="name"]').value.trim();
      const email = this.querySelector('input[name="user_email"]').value.trim();
      const message = this.querySelector('textarea[name="message"]').value.trim();
      const submitBtn = this.querySelector('button[type="submit"]');
      
      if (!name || !email || !message) {
        e.preventDefault();
        alert('Please fill all fields.');
        return false;
      }
      
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        e.preventDefault();
        alert('Please enter a valid email.');
        return false;
      }
      
      // Loading state
      submitBtn.textContent = 'Sending...';
      submitBtn.disabled = true;
    });
  }

  // Dark Mode Toggle
  const darkToggle = document.querySelector('#dark-toggle');
  if (darkToggle) {
    darkToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    });
    
    // Load saved preference
    if (localStorage.getItem('darkMode') === 'true') {
      document.body.classList.add('dark-mode');
    }
  }

  // Services Tabs (for services.html)
  const serviceTabs = document.querySelectorAll('.service-tab');
  const serviceContents = document.querySelectorAll('.service-content');
  
  serviceTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      serviceTabs.forEach(t => t.classList.remove('active'));
      serviceContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      serviceContents[index].classList.add('active');
    });
  });

  // Testimonials Slider (for about.html)
  let currentSlide = 0;
  const slides = document.querySelectorAll('.testimonial-slide');
  const totalSlides = slides.length;
  const sliderNav = document.querySelector('.slider-nav');

  if (slides.length > 1) {
    setInterval(() => {
      slides[currentSlide].classList.remove('active');
      currentSlide = (currentSlide + 1) % totalSlides;
      slides[currentSlide].classList.add('active');
    }, 5000);

    // Nav dots
    sliderNav.innerHTML = slides.map((_, i) => `<button class="nav-dot ${i===0 ? 'active' : ''}" data-slide="${i}"></button>`).join('');
    
    document.querySelectorAll('.nav-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        slides[currentSlide].classList.remove('active');
        currentSlide = parseInt(dot.dataset.slide);
        slides[currentSlide].classList.add('active');
        document.querySelectorAll('.nav-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
      });
    });
  }

  // Hero Scroll Indicator
  const hero = document.querySelector('.hero');
  if (hero) {
    const scrollIndicator = document.createElement('div');
    scrollIndicator.innerHTML = '⌄';
    scrollIndicator.className = 'scroll-indicator';
    hero.appendChild(scrollIndicator);
    
    scrollIndicator.addEventListener('click', () => {
      document.querySelector('#services')?.scrollIntoView({ behavior: 'smooth' });
    });
  }
});

