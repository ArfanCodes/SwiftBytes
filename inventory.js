 
        let inventory = [
            { id: 1, name: "Chicken Shawarma", price: 149, quantity: 25, image: "images/Chicken Shawarma.webp", url: "/menu/chicken-shawarma" },
            { id: 2, name: "Chicken Sandwich", price: 149, quantity: 18, image: "images/Chicken Sandwich.webp", url: "/menu/chicken-sandwich" },
            { id: 3, name: "Chicken Puff", price: 149, quantity: 12, image: "images/Chicken Puff.webp", url: "/menu/chicken-puff" },
            { id: 4, name: "Chicken Patty Burger", price: 149, quantity: 8, image: "images/Chicken Patty Burger.webp", url: "/menu/chicken-patty-burger" },
            { id: 5, name: "Veg Burger", price: 149, quantity: 15, image: "images/Veg Burger.webp", url: "/menu/veg-burger" },
            { id: 6, name: "Chicken 65 Roll", price: 149, quantity: 20, image: "images/Chicken 65 Roll.webp", url: "/menu/chicken-65-roll" },
            { id: 7, name: "Chicken Biryani", price: 149, quantity: 10, image: "images/Chicken Biryani.webp", url: "/menu/chicken-biryani" },
            { id: 8, name: "Chicken Fried Rice", price: 149, quantity: 14, image: "images/Chicken Fried Rice.webp", url: "/menu/chicken-fried-rice" },
            { id: 9, name: "Chicken Schezwan Fried Rice", price: 149, quantity: 16, image: "images/Chicken Schezwan Fried Rice.webp", url: "/menu/chicken-schezwan-fried-rice" },
            { id: 10, name: "Chicken Noodles", price: 149, quantity: 22, image: "images/Chicken Noodles.webp", url: "/menu/chicken-noodles" },
            { id: 11, name: "Chicken Schezwan Noodles", price: 149, quantity: 18, image: "images/Chicken Schezwan Noodles.webp", url: "/menu/chicken-schezwan-noodles" },
            { id: 12, name: "White Sauce Pasta", price: 149, quantity: 12, image: "images/White Sauce Pasta.webp", url: "/menu/white-sauce-pasta" },
            { id: 13, name: "Choco Lava Cake", price: 149, quantity: 8, image: "images/Choco Lava Cake.webp", url: "/menu/choco-lava-cake" },
            { id: 14, name: "Chocolate Donut", price: 149, quantity: 25, image: "images/Chocolate Donut.webp", url: "/menu/chocolate-donut" },
            { id: 15, name: "Campa", price: 10, quantity: 50, image: "images/Campa.webp", url: "/menu/campa" },
            { id: 16, name: "Maaza", price: 10, quantity: 45, image: "images/Maaza.webp", url: "/menu/maaza" },
            { id: 17, name: "Bisleri Water Bottle", price: 10, quantity: 100, image: "images/Bisleri Water Bottle.webp", url: "/menu/bisleri-water-bottle" }
        ];

        let editingItemId = null;

        function renderInventory() {
            const tbody = document.getElementById('inventoryTableBody');
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            
            const filteredInventory = inventory.filter(item => 
                item.name.toLowerCase().includes(searchTerm)
            );

            tbody.innerHTML = filteredInventory.map(item => `
                <tr>
                    <td>
                        <img src="${item.image}" alt="${item.name}" class="item-image" 
                             onerror="this.src='https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=300&h=200&fit=crop'">
                    </td>
                    <td class="item-name">${item.name}</td>
                    <td class="item-price">₹${item.price}</td>
                    <td>
                        <div class="quantity-controls">
                            <button class="quantity-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
                            <span class="quantity-display">${item.quantity}</span>
                            <button class="quantity-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
                        </div>
                    </td>
                    <td>
                        <span class="stock-badge ${getStockClass(item.quantity)}">
                            ${getStockStatus(item.quantity)}
                        </span>
                    </td>
                    <td>
                        <a href="${item.url}" target="_blank" style="color: #667eea; text-decoration: none;">
                            ${item.url}
                        </a>
                    </td>
                    <td>
                        <button class="btn btn-edit" onclick="editItem(${item.id})">
                            ✏️ Edit
                        </button>
                        <button class="btn btn-danger" onclick="deleteItem(${item.id})" style="margin-left: 10px;">
                            🗑️ Delete
                        </button>
                    </td>
                </tr>
            `).join('');

            updateStats();
        }

        function getStockStatus(quantity) {
            if (quantity === 0) return 'Out of Stock';
            if (quantity <= 5) return 'Low Stock';
            return 'In Stock';
        }

        function getStockClass(quantity) {
            if (quantity === 0) return 'stock-out';
            if (quantity <= 5) return 'stock-low';
            return 'stock-in';
        }

        function updateStats() {
            const totalItems = inventory.length;
            const lowStock = inventory.filter(item => item.quantity > 0 && item.quantity <= 5).length;
            const outOfStock = inventory.filter(item => item.quantity === 0).length;
            const totalValue = inventory.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            document.getElementById('totalItems').textContent = totalItems;
            document.getElementById('lowStock').textContent = lowStock;
            document.getElementById('outOfStock').textContent = outOfStock;
            document.getElementById('totalValue').textContent = `₹${totalValue}`;
        }

        function updateQuantity(id, change) {
            const item = inventory.find(item => item.id === id);
            if (item) {
                item.quantity = Math.max(0, item.quantity + change);
                renderInventory();
            }
        }

        function deleteItem(id) {
            if (confirm('Are you sure you want to delete this item?')) {
                inventory = inventory.filter(item => item.id !== id);
                renderInventory();
            }
        }

        function openAddModal() {
            editingItemId = null;
            document.getElementById('modalTitle').textContent = 'Add New Item';
            document.getElementById('itemForm').reset();
            document.getElementById('itemModal').style.display = 'block';
        }

        function editItem(id) {
            const item = inventory.find(item => item.id === id);
            if (item) {
                editingItemId = id;
                document.getElementById('modalTitle').textContent = 'Edit Item';
                document.getElementById('itemName').value = item.name;
                document.getElementById('itemPrice').value = item.price;
                document.getElementById('itemQuantity').value = item.quantity;
                document.getElementById('itemImage').value = item.image;
                document.getElementById('itemUrl').value = item.url;
                document.getElementById('itemModal').style.display = 'block';
            }
        }

        function closeModal() {
            document.getElementById('itemModal').style.display = 'none';
            editingItemId = null;
        }

        document.getElementById('itemForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const name = document.getElementById('itemName').value;
            const price = parseFloat(document.getElementById('itemPrice').value);
            const quantity = parseInt(document.getElementById('itemQuantity').value);
            const image = document.getElementById('itemImage').value || `images/${name}.webp`;
            const url = document.getElementById('itemUrl').value || `/menu/${name.toLowerCase().replace(/\s+/g, '-')}`;

            if (editingItemId) {
                // Edit existing item
                const item = inventory.find(item => item.id === editingItemId);
                if (item) {
                    item.name = name;
                    item.price = price;
                    item.quantity = quantity;
                    item.image = image;
                    item.url = url;
                }
            } else {
                // Add new item
                const newItem = {
                    id: Date.now(),
                    name,
                    price,
                    quantity,
                    image,
                    url
                };
                inventory.push(newItem);
            }

            closeModal();
            renderInventory();
        });

        document.getElementById('searchInput').addEventListener('input', renderInventory);

        // Close modal when clicking outside
        window.addEventListener('click', function(e) {
            const modal = document.getElementById('itemModal');
            if (e.target === modal) {
                closeModal();
            }
        });

        // Initial render
        renderInventory();

// Optional — a function to get latest inventory
export function getInventory() {
  return inventory;
}

   