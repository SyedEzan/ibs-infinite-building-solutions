<?php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = trim($_POST['name'] ?? '');
    $user_email = trim($_POST['user_email'] ?? '');
    $message = trim($_POST['message'] ?? '');

    if (empty($name) || empty($user_email) || empty($message)) {
        $status = 'error';
        $msg = 'All fields are required.';
    } elseif (!filter_var($user_email, FILTER_VALIDATE_EMAIL)) {
        $status = 'error';
        $msg = 'Invalid email format.';
    } else {
        $to = 'syedezan850@gmail.com';
        $subject = 'New Contact Form Submission from IBS Website';
        $email_body = "
        <html>
        <head>
            <title>New Contact Form Submission</title>
        </head>
        <body>
            <h2>New Contact Message</h2>
            <p><strong>Name:</strong> $name</p>
            <p><strong>Email:</strong> $user_email</p>
            <p><strong>Message:</strong><br>$message</p>
            <hr>
            <p>This email was sent from IBS contact form.</p>
        </body>
        </html>
        ";
        $headers = [
            'MIME-Version: 1.0',
            'Content-type: text/html; charset=UTF-8',
            "From: $user_email",
"Reply-To: $user_email"
        ];
        $headers = implode("\r\n", $headers);

        if (mail($to, $subject, $email_body, $headers)) {
            $status = 'success';
            $msg = 'Thank you! Your message has been sent successfully. We\'ll get back to you within 24 hours.';
        } else {
            $status = 'error';
            $msg = 'Sorry, there was an error sending your message. Please try again or call us directly.';
        }
    }
} else {
    $status = 'error';
    $msg = 'Invalid request method.';
}
?>

<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?php echo $status === 'success' ? 'Thank You! - IBS' : 'Error - IBS'; ?></title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            primary: '#003087',
            secondary: '#007bff'
          }
        }
      }
    }
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .dark body { color-scheme: dark; }
  </style>
</head>
<body class="bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100 min-h-screen">

  <!-- Navigation -->
  <nav class="bg-primary/95 backdrop-blur-md fixed w-full z-50 shadow-lg">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center py-4">
        <div class="text-2xl font-bold text-white flex items-center gap-2">
          <img src="./assets/logo.png.png" alt="IBS Logo" class="h-10 w-auto">
          IBS
        </div>
        <div class="hidden md:flex items-center gap-8">
          <a href="IBS.html" class="text-white font-semibold hover:text-blue-200 px-3 py-2 rounded-lg transition">Home</a>
          <a href="about.html" class="text-white font-semibold hover:text-blue-200 px-3 py-2 rounded-lg transition">About</a>
          <a href="services.html" class="text-white font-semibold hover:text-blue-200 px-3 py-2 rounded-lg transition">Services</a>
          <a href="contact.html" class="text-white font-semibold bg-white/20 px-4 py-2 rounded-lg transition">Contact</a>
        </div>
      </div>
    </div>
  </nav>

  <!-- Result Section -->
  <section class="pt-32 pb-24 px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl mx-auto bg-white dark:bg-gray-800 p-12 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 animate-on-scroll">
      <div class="text-center">
        <?php if ($status === 'success'): ?>
          <div class="w-32 h-32 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full mx-auto mb-8 flex items-center justify-center shadow-2xl">
            <svg class="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h1 class="text-5xl md:text-6xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent mb-6">
            Message Sent!
          </h1>
          <p class="text-2xl text-gray-700 dark:text-gray-300 mb-12 leading-relaxed max-w-2xl mx-auto">
            <?php echo htmlspecialchars($msg); ?>
          </p>
        <?php else: ?>
          <div class="w-32 h-32 bg-gradient-to-br from-red-400 to-red-600 rounded-full mx-auto mb-8 flex items-center justify-center shadow-2xl">
            <svg class="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          <h1 class="text-5xl md:text-6xl font-bold bg-gradient-to-r from-red-500 to-red-600 bg-clip-text text-transparent mb-6">
            Try Again
          </h1>
          <p class="text-2xl text-gray-700 dark:text-gray-300 mb-12 leading-relaxed max-w-2xl mx-auto">
            <?php echo htmlspecialchars($msg); ?>
          </p>
        <?php endif; ?>
        
        <div class="grid md:grid-cols-2 gap-6">
          <a href="contact.html" class="bg-gradient-to-r from-primary to-secondary text-white py-6 px-12 rounded-2xl font-bold text-xl hover:shadow-2xl hover:scale-105 shadow-xl transition-all text-center block">
            ← Back to Contact
          </a>
          <a href="tel:+923323070499" class="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-6 px-12 rounded-2xl font-bold text-xl hover:shadow-2xl hover:scale-105 shadow-xl transition-all text-center block">
            Call Now ☎️
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- Quick Contact Options -->
  <section class="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
    <div class="max-w-4xl mx-auto text-center">
      <h2 class="text-4xl md:text-5xl font-bold mb-12 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
        Need Immediate Help?
      </h2>
      <div class="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
        <div class="bg-white dark:bg-gray-800 p-10 rounded-3xl shadow-2xl hover:shadow-3xl transition-all border">
          <div class="text-6xl mb-6">📞</div>
          <h3 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Call Us</h3>
          <a href="tel:+923323070499" class="text-4xl font-bold text-primary block hover:text-secondary transition-all">+92 332 3070499</a>
          <p class="text-lg text-gray-600 dark:text-gray-400 mt-4">24/7 Emergency Support</p>
        </div>
        <div class="bg-gradient-to-br from-primary to-secondary text-white p-10 rounded-3xl shadow-2xl hover:shadow-3xl transition-all">
          <div class="text-6xl mb-6">💬</div>
          <h3 class="text-3xl font-bold mb-4">WhatsApp</h3>
          <a href="https://wa.me/923323070499" target="_blank" class="text-4xl font-bold block hover:scale-105 transition-all">Chat Now</a>
          <p class="opacity-90 mt-4">Instant Response</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="bg-gray-900 text-white py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-8 text-center md:text-left">
      <div>
        <h3 class="text-2xl font-bold mb-4 flex items-center justify-center md:justify-start gap-2">
          <img src="./assets/logo.png.png" alt="IBS Logo" class="h-10 w-auto"> IBS
        </h3>
        <p class="text-gray-300">Thank you for choosing Infinite Building Solutions.</p>
      </div>
      <div>
        <h4 class="text-xl font-semibold mb-4">Quick Links</h4>
        <ul class="space-y-2">
          <li><a href="IBS.html" class="hover:text-secondary transition">Home</a></li>
          <li><a href="about.html" class="hover:text-secondary transition">About</a></li>
          <li><a href="services.html" class="hover:text-secondary transition">Services</a></li>
        </ul>
      </div>
      <div>
        <h4 class="text-xl font-semibold mb-4">Services</h4>
        <ul class="space-y-2">
          <li><a href="services.html#waterproofing" class="hover:text-secondary transition">Waterproofing</a></li>
          <li><a href="services.html#termite" class="hover:text-secondary transition">Termite</a></li>
          <li><a href="services.html#insulation" class="hover:text-secondary transition">Insulation</a></li>
        </ul>
      </div>
      <div>
        <h4 class="text-xl font-semibold mb-4">Contact</h4>
        <div class="space-y-3">
          <p>📞 <a href="tel:+923323070499" class="hover:text-secondary block">(0332) 3070499</a></p>
          <p>📧 <a href="mailto:info@ibsolutions.pk" class="hover:text-secondary block">info@ibsolutions.pk</a></p>
        </div>
      </div>
    </div>
    <div class="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
      <p>&copy; 2024 IBS - Infinite Building Solutions. All rights reserved.</p>
    </div>
  </footer>

  <script src="script.js" defer></script>
</body>
</html>
