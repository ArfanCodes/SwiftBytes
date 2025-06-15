// Add this code to your JavaScript file
    document.addEventListener("DOMContentLoaded", function () {
  // Initialize cart state
  let cart = {
    items: [],
    total: 0,
    priorityAmount: 0, // New property for priority amount    priorityAmount: 0, // New property for priority amount
  };

    //Add Razorpay script to the page
    const razorpayScript = document.createElement('script');
    razorpayScript.src = 'https://checkout.razorpay.com/v1/checkout.js';
    document.head.appendChild(razorpayScript);

     // Cart toggle functionality - target both the icon and its parent
  const cartIcon = document.querySelector(".fa-solid.fa-cart-shopping");
  const cartButton = cartIcon
    ? cartIcon.closest("button") ||
      cartIcon.closest("a") ||
      cartIcon.parentElement
    : null;
  const addToCartButtons = document.querySelectorAll(".bi.bi-bag-plus");

  // FIX 4: Improved cart icon click handling
  // First, make sure the cart icon itself is clickable
  if (cartIcon) {
    cartIcon.style.pointerEvents = "auto";
    cartIcon.style.cursor = "pointer";
    cartIcon.addEventListener("click", function (e) {
      e.stopPropagation(); // Prevent event bubbling
      toggleCart(e);
    });
  }

  // Make the entire cart button area clickable
  if (cartButton && cartButton !== cartIcon) {
    cartButton.addEventListener("click", toggleCart);
  }
  // FIX 1: Improved event handling for product cards to prevent page jumps
  document
    .querySelectorAll(".product-card, .product-item, .menu-item")
    .forEach((card) => {
      // Prevent clicks on the entire card and its images from causing page jumps
      card.addEventListener("click", function (e) {
        // Prevent default action on the entire card, images, and non-interactive elements
        const isInteractiveElement = e.target.closest(
          'a[href]:not([href="#"]), button, input, .bi-bag-plus, svg[role="button"]'
        );
        if (!isInteractiveElement) {
          e.preventDefault();
        }
      });

      // Also explicitly handle clicks on any images within the card
      const cardImages = card.querySelectorAll("img");
      cardImages.forEach((img) => {
        img.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
        });
      });
    });
    

  // Create cart sidebar elements
  const cartSidebar = document.createElement("div");
  cartSidebar.className =
    "fixed top-0 right-0 h-full w-0 bg-white dark:bg-gray-900 shadow-lg transform transition-all duration-300 ease-in-out z-50 overflow-hidden";
  cartSidebar.id = "cart-sidebar";

  // Cart header
  const cartHeader = document.createElement("div");
  cartHeader.className =
    "flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800";

  const cartTitle = document.createElement("h2");
  cartTitle.className = "text-xl font-bold dark:text-white";
  cartTitle.textContent = "Your Cart";

  const closeButton = document.createElement("button");
  closeButton.className =
    "text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white focus:outline-none";
  closeButton.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>';

  cartHeader.appendChild(cartTitle);
  cartHeader.appendChild(closeButton);
  cartSidebar.appendChild(cartHeader);

  // Cart content
  const cartContent = document.createElement("div");
  cartContent.className = "flex flex-col h-full";

  // Items container
  const itemsContainer = document.createElement("div");
  itemsContainer.className = "flex-grow overflow-y-auto p-4";
  itemsContainer.id = "cart-items";

  // Empty cart message
  const emptyCart = document.createElement("div");
  emptyCart.className = "text-center text-gray-500 dark:text-gray-400 py-8";
  emptyCart.id = "empty-cart";
  emptyCart.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        <p class="mt-4">Your cart is empty</p>
    `;
    itemsContainer.appendChild(emptyCart);
    
    // Cart Footer Section
const cartFooter = document.createElement('div');
cartFooter.className = 'border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800 sticky bottom-0';
cartFooter.id = 'cart-footer';

// Total, Priority Fee & Total Amount Display
const totalContainer = document.createElement('div');
totalContainer.className = 'space-y-2 mb-4';

// Subtotal Row
const subtotalContainer = document.createElement('div');
subtotalContainer.className = 'flex justify-between items-center text-sm';

const subtotalLabel = document.createElement('span');
subtotalLabel.className = 'text-gray-600 dark:text-gray-400';
subtotalLabel.textContent = 'Subtotal:';

const subtotalAmount = document.createElement('span');
subtotalAmount.className = 'text-gray-600 dark:text-gray-400';
subtotalAmount.id = 'cart-subtotal';
subtotalAmount.textContent = '₹0';

subtotalContainer.appendChild(subtotalLabel);
subtotalContainer.appendChild(subtotalAmount);

// Priority Fee Row (hidden initially)
const priorityContainer = document.createElement('div');
priorityContainer.className = 'flex justify-between items-center text-sm hidden';
priorityContainer.id = 'priority-fee-display';

const priorityLabel = document.createElement('span');
priorityLabel.className = 'text-orange-600 dark:text-orange-400';
priorityLabel.textContent = 'Priority Fee:';

const priorityAmount = document.createElement('span');
priorityAmount.className = 'text-orange-600 dark:text-orange-400';
priorityAmount.id = 'priority-amount';
priorityAmount.textContent = '₹0';

priorityContainer.appendChild(priorityLabel);
priorityContainer.appendChild(priorityAmount);

// Total Row
const totalMainContainer = document.createElement('div');
totalMainContainer.className = 'flex justify-between items-center border-t border-gray-200 dark:border-gray-600 pt-2';

const totalLabel = document.createElement('span');
totalLabel.className = 'text-lg font-semibold dark:text-white';
totalLabel.textContent = 'Total:';

const totalAmount = document.createElement('span');
totalAmount.className = 'text-lg font-bold dark:text-white';
totalAmount.id = 'cart-total';
totalAmount.textContent = '₹0';

totalMainContainer.appendChild(totalLabel);
totalMainContainer.appendChild(totalAmount);

// Append subtotal, priority fee and total to container
totalContainer.appendChild(subtotalContainer);
totalContainer.appendChild(priorityContainer);
totalContainer.appendChild(totalMainContainer);

// Priority Order Section
const priorityWrapper = document.createElement('div');
priorityWrapper.className = 'mb-4';

const priorityTitle = document.createElement('h3');
priorityTitle.className = 'text-sm font-medium text-gray-700 dark:text-gray-300 mb-2';
priorityTitle.textContent = 'Priority Order (Optional)';

const priorityDescription = document.createElement('p');
priorityDescription.className = 'text-xs text-gray-500 dark:text-gray-400 mb-3';
priorityDescription.textContent = 'Pay extra to get your order prepared first';

const priorityOptions = document.createElement('div');
priorityOptions.className = 'grid grid-cols-4 gap-2';

const priorityValues = [
  { value: 0, label: 'None', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
  { value: 10, label: '+₹10', color: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' },
  { value: 30, label: '+₹30', color: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' },
  { value: 50, label: '+₹50', color: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' },
];

// Priority Buttons
priorityValues.forEach((option) => {
  const priorityButton = document.createElement('button');
  priorityButton.className = `px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 border-2 border-transparent ${option.color}`;
  priorityButton.textContent = option.label;
  priorityButton.dataset.value = option.value;
  priorityButton.type = 'button';

  // Set default selection
  if (option.value === 0) {
    priorityButton.classList.add('ring-2', 'ring-blue-500');
  }

  // Button Click Handler
  priorityButton.addEventListener('click', () => {
    priorityOptions.querySelectorAll('button').forEach(btn => {
      btn.classList.remove('ring-2', 'ring-blue-500');
    });
    priorityButton.classList.add('ring-2', 'ring-blue-500');

    cart.priorityAmount = parseInt(priorityButton.dataset.value);
    updateCart();
  });

  priorityOptions.appendChild(priorityButton);
});

// Append priority section components
priorityWrapper.appendChild(priorityTitle);
priorityWrapper.appendChild(priorityDescription);
priorityWrapper.appendChild(priorityOptions);

// Phone Input Section
const phoneWrapper = document.createElement('div');
phoneWrapper.className = 'mb-4';

const phoneContainer = document.createElement('div');
phoneContainer.className = 'flex items-center border border-gray-300 rounded-md overflow-hidden focus-within:ring focus-within:border-blue-500';

const countryCode = document.createElement('div');
countryCode.className = 'bg-gray-100 dark:bg-gray-700 px-3 py-2 text-gray-700 dark:text-gray-300';
countryCode.textContent = '+91';

const phoneInput = document.createElement('input');
phoneInput.type = 'tel';
phoneInput.placeholder = 'Enter 10-digit phone number';
phoneInput.className = 'flex-grow p-2 focus:outline-none dark:bg-gray-800 dark:text-white';
phoneInput.maxLength = 10;
phoneInput.id = 'phone-input';

phoneContainer.appendChild(countryCode);
phoneContainer.appendChild(phoneInput);
phoneWrapper.appendChild(phoneContainer);

const phoneError = document.createElement('p');
phoneError.className = 'text-red-500 text-sm mt-1 hidden';
phoneError.id = 'phone-error';
phoneError.textContent = 'Please enter a valid 10-digit phone number';
phoneWrapper.appendChild(phoneError);

// Checkout Button
const checkoutButton = document.createElement('button');
checkoutButton.className = 'w-full bg-yellow-500 text-white py-3 rounded-md font-semibold hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
checkoutButton.id = 'checkout-button';
checkoutButton.textContent = 'Checkout';
checkoutButton.disabled = true;

// Assemble Footer Sections
cartFooter.appendChild(totalContainer);
cartFooter.appendChild(priorityWrapper);
cartFooter.appendChild(phoneWrapper);
cartFooter.appendChild(checkoutButton);

// Append to cart content/sidebar
cartContent.appendChild(itemsContainer);
cartContent.appendChild(cartFooter);
cartSidebar.appendChild(cartContent);

// Toast Notification
const notificationToast = document.createElement('div');
notificationToast.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg transform translate-y-20 opacity-0 transition-all duration-300 z-50';
notificationToast.id = 'notification-toast';
document.body.appendChild(notificationToast);

// Cart Overlay
const cartOverlay = document.createElement('div');
cartOverlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-40 hidden transition-opacity duration-300 opacity-0';
cartOverlay.id = 'cart-overlay';
document.body.appendChild(cartOverlay);

// Event Handlers
closeButton.addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);
checkoutButton.addEventListener('click', handleCheckout);

// Phone Validation
let isPhoneValid = false;

phoneInput.addEventListener('input', () => {
  const phoneValue = phoneInput.value;
  const phoneRegex = /^\d{10}$/;
  isPhoneValid = phoneRegex.test(phoneValue);

  if (phoneValue.length > 0 && !isPhoneValid) {
    phoneError.classList.remove('hidden');
    checkoutButton.disabled = true;
  } else {
    phoneError.classList.add('hidden');
    checkoutButton.disabled = !isPhoneValid || cart.items.length === 0;
  }
});




const container = document.getElementById("Projects");

// Declare globally
let menuItems = [];

// Fetch menu items from the server
fetch('/menu')
  .then(response => response.json())
  .then(items => {
    menuItems = items; // assign to outer variable

    menuItems.forEach((product) => {
      const card = document.createElement("div");
      card.className =
        "w-72 bg-white dark:bg-gray-800 shadow-md rounded-xl duration-500 hover:scale-105 hover:shadow-xl product-card transition-colors duration-300";

      card.innerHTML = `
        <div>
          <img src="${product.image}" alt="${product.name}" class="h-80 w-72 object-cover rounded-t-xl">
          <div class="px-4 py-3 w-72">
            <h3 class="text-lg font-bold text-text-light dark:text-text-dark truncate capitalize transition-colors duration-300">${product.name}</h3>
            <div class="flex items-center">
              <p class="text-lg font-semibold text-text-light dark:text-text-dark cursor-auto my-3 price transition-colors duration-300">₹${product.price}</p>
              <div class="ml-auto cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#e29400" class="bi bi-bag-plus" viewBox="0 0 16 16">
                  <path fill-rule="evenodd" d="M8 7.5a.5.5 0 0 1 .5.5v1.5H10a.5.5 0 0 1 0 1H8.5V12a.5.5 0 0 1-1 0v-1.5H6a.5.5 0 0 1 0-1h1.5V8a.5.5 0 0 1 .5-.5z"/>
                  <path d="M8 1a2.5 2.5 0 0 1 2.5 2.5V4h-5v-.5A2.5 2.5 0 0 1 8 1zm3.5 3v-.5a3.5 3.5 0 1 0-7 0V4H1v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4h-3.5zM2 5h12v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  })
  .catch(err => {
    console.error('Error fetching menu items:', err);
  });

// Event delegation
container.addEventListener('click', function (e) {
  if (e.target.closest('.bi-bag-plus')) {
    const productCard = e.target.closest('.product-card');
    if (!productCard) return;

    const productName = productCard.querySelector('h3')?.textContent;
    let productPrice = 149;

    if (productName) {
      const menuItem = menuItems.find(item => item.name === productName.trim());
      if (menuItem) {
        productPrice = menuItem.price;
      } else {
        const priceElement = productCard.querySelector('.price');
        if (priceElement) {
          const priceText = priceElement.textContent;
          const priceMatch = priceText.match(/₹(\d+)/);
          if (priceMatch && priceMatch[1]) {
            productPrice = parseInt(priceMatch[1], 10);
          }
        }
      }
    }

    addToCart({
      id: Date.now().toString(),
      name: productName,
      price: productPrice,
      quantity: 1
    });

    showNotification(`${productName} added to cart!`);
  }
});



    
    // Functions
    function toggleCart(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        
        if (cartSidebar.classList.contains('w-80')) {
            closeCart();
        } else {
            cartSidebar.classList.remove('w-0');
            cartSidebar.classList.add('w-80');
            cartOverlay.classList.remove('hidden', 'opacity-0');
            cartOverlay.classList.add('opacity-100');
            document.body.style.overflow = 'hidden';
        }
    }
    
    function closeCart() {
        const cartSidebar = document.getElementById('cart-sidebar');
        const cartOverlay = document.getElementById('cart-overlay');
        
        cartSidebar.classList.remove('w-80');
        cartSidebar.classList.add('w-0');
        cartOverlay.classList.add('opacity-0');
        
        setTimeout(() => {
            cartOverlay.classList.add('hidden');
            document.body.style.overflow = '';
        }, 300);
    }
    
    function addToCart(product) {
        // Check if item already exists in cart
        const existingItemIndex = cart.items.findIndex(item => 
            item.name === product.name
        );
        
        if (existingItemIndex !== -1) {
            // Increment quantity if item exists
            cart.items[existingItemIndex].quantity += 1;
        } else {
            // Add new item
            cart.items.push(product);
        }
        
        // Update cart
        updateCart();
    }
    
    function updateCart() {
        const itemsContainer = document.getElementById('cart-items');
        const emptyCart = document.getElementById('empty-cart');
        const totalElement = document.getElementById('cart-total');
        const checkoutButton = document.getElementById('checkout-button');
        const phoneInput = document.getElementById('phone-input');
        
        // Calculate total
        cart.total = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
        
        // Update total display
        totalElement.textContent = `₹${cart.total}`;
        
        // Enable/disable checkout button based on cart and phone validation
        const isPhoneValid = /^\d{10}$/.test(phoneInput.value);
        checkoutButton.disabled = cart.items.length === 0 || !isPhoneValid;
        
        // Clear existing items
        Array.from(itemsContainer.children).forEach(child => {
            if (child.id !== 'empty-cart') {
                itemsContainer.removeChild(child);
            }
        });
        
        // Show/hide empty cart message
        if (cart.items.length === 0) {
            emptyCart.classList.remove('hidden');
        } else {
            emptyCart.classList.add('hidden');
        }
        
        // Add cart items
        cart.items.forEach(item => {
            const cartItem = document.createElement('div');
            cartItem.className = 'flex items-center mb-4 pb-4 border-b border-gray-100 dark:border-gray-700';
            cartItem.dataset.id = item.id;
            
            // Item details
            const itemDetails = document.createElement('div');
            itemDetails.className = 'flex-grow';
            
            const itemName = document.createElement('p');
            itemName.className = 'font-medium dark:text-white';
            itemName.textContent = item.name;
            
            const itemPrice = document.createElement('p');
            itemPrice.className = 'text-gray-600 dark:text-gray-300 text-sm';
            itemPrice.textContent = `₹${item.price}`;
            
            itemDetails.appendChild(itemName);
            itemDetails.appendChild(itemPrice);
            
            // Quantity controls
            const quantityControls = document.createElement('div');
            quantityControls.className = 'flex items-center';
            
            const decrementButton = document.createElement('button');
            decrementButton.className = 'w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none';
            decrementButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" /></svg>';
            decrementButton.addEventListener('click', () => updateItemQuantity(item.id, -1));
            
            const quantityDisplay = document.createElement('span');
            quantityDisplay.className = 'mx-2 w-4 text-center dark:text-white';
            quantityDisplay.textContent = item.quantity;
            
            const incrementButton = document.createElement('button');
            incrementButton.className = 'w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none';
            incrementButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12M6 12h12" /></svg>';
            incrementButton.addEventListener('click', () => updateItemQuantity(item.id, 1));
            
            quantityControls.appendChild(decrementButton);
            quantityControls.appendChild(quantityDisplay);
            quantityControls.appendChild(incrementButton);
            
            // Remove button
            const removeButton = document.createElement('button');
            removeButton.className = 'ml-4 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 focus:outline-none';
            removeButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>';
            removeButton.addEventListener('click', () => removeItem(item.id));
            
            // Assemble item
            cartItem.appendChild(itemDetails);
            cartItem.appendChild(quantityControls);
            cartItem.appendChild(removeButton);
            
            itemsContainer.appendChild(cartItem);
        });
    }
    
    function updateItemQuantity(itemId, change) {
        const itemIndex = cart.items.findIndex(item => item.id === itemId);
        if (itemIndex === -1) return;
        
        cart.items[itemIndex].quantity += change;
        
        // Remove item if quantity is 0 or less
        if (cart.items[itemIndex].quantity <= 0) {
            removeItem(itemId);
            return;
        }
        
        updateCart();
    }
    
    function removeItem(itemId) {
        cart.items = cart.items.filter(item => item.id !== itemId);
        updateCart();
    }
    
    function showNotification(message) {
        const toast = document.getElementById('notification-toast');
        toast.textContent = message;
        
        // Show notification
        toast.classList.remove('translate-y-20', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
        
        // Hide after 2 seconds
        setTimeout(() => {
            toast.classList.remove('translate-y-0', 'opacity-100');
            toast.classList.add('translate-y-20', 'opacity-0');
        }, 2000);
    }
    
    function handleCheckout() {
    if (cart.items.length === 0) return;

    const phoneInput = document.getElementById('phone-input');
    const phoneValue = phoneInput.value;

    if (!/^\d{10}$/.test(phoneValue)) {
        document.getElementById('phone-error').classList.remove('hidden');
        return;
    }

    // Calculate cart total
    const amount = calculateCartTotal();

    // Initialize Razorpay payment
    initializeRazorpayPayment(amount, phoneValue);

    
}

// Function to calculate cart total
function calculateCartTotal() {
    return cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
}

// Function to initialize Razorpay payment
function initializeRazorpayPayment(amount, phoneNumber) {
    // Convert amount to paise (Razorpay requires amount in smallest currency unit)
    const amountInPaise = Math.round(amount * 100);
    
    // Create a new instance of Razorpay
    const options = {
        key: "rzp_test_VCIn0ydmyceB7m", // Razorpay test Key ID
        amount: amountInPaise,
        currency: "INR",
        name: "Your Store Name",
        description: "Purchase Order",
        image: "your-logo-url.png", // Replace with your logo URL
        handler: function(response) {
            // This function is called when payment is successful
            handlePaymentSuccess(response, phoneNumber);
        },
        prefill: {
            contact: "+91" + phoneNumber
        },
        notes: {
            itemCount: cart.items.length
        },
        theme: {
            color: "#3399cc"
        }
    };
    
    const rzp = new Razorpay(options);
    rzp.open();
    
    // Handle payment failure
    rzp.on('payment.failed', function(response) {
        showNotification("Payment failed. Please try again.");
        console.error("Payment failed:", response.error);
    });
}

function handlePaymentSuccess(response, phoneNumber) {
    const paymentId = response.razorpay_payment_id;

    // Store payment details (for logging / debug)
    const paymentDetails = {
        razorpayPaymentId: paymentId,
        orderItems: cart.items,
        total: calculateCartTotal(),
        phoneNumber: "+91" + phoneNumber,
        timestamp: new Date().toISOString()
    };

    console.log("Payment successful!", paymentDetails);

    // Send order to server with paymentId
    fetch("/place-order", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            cart: cart.items,
            phone: phoneNumber,
            payment_id: paymentId
        })
    })
    .then(res => res.json())
    .then(data => {
        showNotification(`Order placed successfully! Payment ID: ${paymentId}. We'll contact you on +91${phoneNumber}`);

        // Clear cart
        cart.items = [];
        updateCart();

        // Clear phone input and error message
        document.getElementById('phone-input').value = '';
        document.getElementById('phone-error').classList.add('hidden');

        // Close cart sidebar
        setTimeout(closeCart, 1000);
    })
    .catch(err => {
        console.error("Error placing order:", err);
        alert("Error placing order.");
    });
}





// Prevent cart opening automatically on load (mobile fix)
setTimeout(function() {
    console.log("Subtotal element:", document.getElementById('cart-subtotal'));
console.log("Total element:", document.getElementById('cart-total'));
console.log("Items container:", document.getElementById('cart-items'));

    updateCart();
}, 1000);

    
    // Add CSS styles for mobile responsiveness and fixed checkout button
    const style = document.createElement('style');
    style.textContent = `
        @media (max-width: 640px) {
            #cart-sidebar {
                width: 0 !important; /* Start closed on mobile */
                max-width: 100% !important;
            }
            
            #cart-sidebar.w-80 {
                width: 100% !important;
            }
        }
        
        #notification-toast {
            position: fixed;
            z-index: 9999;
            pointer-events: none;
        }
        
        #cart-footer {
            position: sticky;
            bottom: 0;
            background: white;
            z-index: 10;
        }
        
        .dark #cart-footer {
            background: #1f2937; /* dark mode footer background */
        }
        
        #checkout-button {
            margin-bottom: 10px;
        }
        
        /* Make product cards not change the cursor to a pointer */
        .product-card, .product-item, .menu-item {
            cursor: default;
        }
        
        /* But keep pointer cursor for interactive elements */
        .product-card a, .product-card button, .product-item a, .product-item button,
        .menu-item a, .menu-item button, .bi-bag-plus, svg[role="button"] {
            cursor: pointer;
        }
        
        /* Fix for product images - prevent them from being draggable which can cause scrolling */
        .product-card img, .product-item img, .menu-item img {
            pointer-events: none;
            user-drag: none;
            -webkit-user-drag: none;
        }
        
        /* Add style for dark mode icons */
        .dark .fa-solid.fa-cart-shopping,
        .dark .bi.bi-bag-plus,
        .dark .product-card svg,
        .dark .product-item svg,
        .dark .menu-item svg {
            color: white;
        }
        
        /* SwiftBytes logo colors in dark mode */
        .dark .logo-text {
            color: white;
        }
        
        .dark .logo-highlight {
            color: #f0b60f; /* Yellow highlight from the logo */
        }
        
        /* Phone input styling */
        #phone-input {
            border: none;
            background: transparent;
        }
        
        .dark #phone-input {
            background: transparent;
        }
        
        /* Phone input container */
        .phone-container {
            transition: all 0.2s ease;
        }
        
        .phone-container:focus-within {
            border-color: #3b82f6;
            box-shadow: 0 0 0 1px #3b82f6;
        }
        
        /* Error message styling */
        #phone-error {
            transition: all 0.2s ease;
        }
    `;
    document.head.appendChild(style);
});

const themeToggleBtn = document.getElementById('theme-toggle');
const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');

// Function to update cart icon colors
function updateCartIconColors() {
    const cartIcons = document.querySelectorAll('.fa-solid.fa-cart-shopping, .bi.bi-bag-plus');
    const isDarkMode = document.documentElement.classList.contains('dark');
   
    cartIcons.forEach(icon => {
        // Remove any inline styles first
        icon.removeAttribute('style');
        
        // Add special class for dark mode instead of inline style
        if (isDarkMode) {
            icon.classList.add('dark-mode-cart-icon');
        } else {
            icon.classList.remove('dark-mode-cart-icon');
        }
    });
}

// Check for saved theme preference or use system preference
if (localStorage.getItem('color-theme') === 'dark' ||
    (!localStorage.getItem('color-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    // If dark mode is preferred
    document.documentElement.classList.add('dark');
    themeToggleLightIcon.classList.add('hidden');
    themeToggleDarkIcon.classList.remove('hidden');
} else {
    // If light mode is preferred
    document.documentElement.classList.remove('dark');
    themeToggleDarkIcon.classList.add('hidden');
    themeToggleLightIcon.classList.remove('hidden');
}

// Update cart icons initially
updateCartIconColors();

// Toggle theme on button click
themeToggleBtn.addEventListener('click', function() {
    // Toggle icons
    themeToggleDarkIcon.classList.toggle('hidden');
    themeToggleLightIcon.classList.toggle('hidden');
    
    // Toggle dark class on html element
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('color-theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('color-theme', 'dark');
    }
    
    // Update cart icons after theme change
    updateCartIconColors();
});