class GitHubStorage {
    constructor() {
        this.owner = 'your-username';
        this.repo = 'your-repo';
        this.branch = 'main';
        this.token = 'your-github-token';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
    }

    // 添加加载状态管理
    setLoading(isLoading) {
        const loadingEl = document.getElementById('loadingIndicator');
        if (isLoading) {
            loadingEl.classList.add('show');
        } else {
            loadingEl.classList.remove('show');
        }
    }

    // 获取产品列表
    async getProducts() {
        try {
            // 检查缓存
            if (this.cache.has('products')) {
                const cached = this.cache.get('products');
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    return cached.data;
                }
            }

            const content = await this.getFile('data/products.json');
            const products = JSON.parse(atob(content.content));
            
            // 更新缓存
            this.cache.set('products', {
                data: products,
                timestamp: Date.now()
            });

            return products;
        } catch (error) {
            throw new Error(`获取产品列表失败: ${error.message}`);
        }
    }

    // 压缩图片
    async compressImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // 设置最大尺寸
                    const maxSize = 1024;
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > height) {
                        if (width > maxSize) {
                            height *= maxSize / width;
                            width = maxSize;
                        }
                    } else {
                        if (height > maxSize) {
                            width *= maxSize / height;
                            height = maxSize;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 转换为 Blob
                    canvas.toBlob((blob) => {
                        resolve(new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    }, 'image/jpeg', 0.8);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // 修改后的保存产品方法
    async saveProduct(productData) {
        this.setLoading(true);
        try {
            // 压缩所有图片
            const compressedColors = await Promise.all(
                productData.colors.map(async (color) => ({
                    ...color,
                    image: await this.compressImage(color.image)
                }))
            );
            productData.colors = compressedColors;

            const currentContent = await this.getFile('data/products.json');
            const products = JSON.parse(atob(currentContent.content));

            const newProduct = {
                id: `${productData.subCategory}-${Date.now()}`,
                ...productData,
                createdAt: new Date().toISOString()
            };

            // 上传图片
            for (const color of productData.colors) {
                await this.uploadImage(
                    color.image,
                    `images/products/${newProduct.id}-${color.name}.jpg`
                );
            }

            products.products.push(newProduct);
            
            // 更新 products.json
            await this.updateFile(
                'data/products.json',
                JSON.stringify(products, null, 2),
                currentContent.sha
            );

            // 清除缓存
            this.cache.delete('products');
            
            return true;
        } catch (error) {
            console.error('保存产品失败:', error);
            throw error;
        } finally {
            this.setLoading(false);
        }
    }

    // 删除产品
    async deleteProduct(productId) {
        this.setLoading(true);
        try {
            const currentContent = await this.getFile('data/products.json');
            const products = JSON.parse(atob(currentContent.content));
            
            const index = products.products.findIndex(p => p.id === productId);
            if (index === -1) {
                throw new Error('产品不存在');
            }

            products.products.splice(index, 1);
            
            await this.updateFile(
                'data/products.json',
                JSON.stringify(products, null, 2),
                currentContent.sha
            );

            // 清除缓存
            this.cache.delete('products');
            
            return true;
        } catch (error) {
            console.error('删除产品失败:', error);
            throw error;
        } finally {
            this.setLoading(false);
        }
    }

    async getFile(path) {
        const response = await fetch(
            `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`,
            {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        return response.json();
    }

    async updateFile(path, content, sha) {
        const response = await fetch(
            `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: '更新产品数据',
                    content: btoa(content),
                    sha: sha,
                    branch: this.branch
                })
            }
        );
        return response.json();
    }

    async uploadImage(file, path) {
        const reader = new FileReader();
        const content = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(file);
        });

        return this.updateFile(path, content);
    }

    // 加载并显示产品列表
    async loadProductList() {
        this.setLoading(true);
        try {
            const data = await this.getProducts();
            this.renderProductList(data.products);
        } catch (error) {
            console.error('加载产品列表失败:', error);
            alert('加载产品列表失败，请重试');
        } finally {
            this.setLoading(false);
        }
    }

    // 渲染产品列表
    renderProductList(products) {
        const productList = document.getElementById('productList');
        productList.innerHTML = products.map(product => `
            <div class="product-item" data-id="${product.id}">
                <div class="product-info">
                    <h3>${product.name}</h3>
                    <p>类别: ${this.getCategoryLabel(product.category)} - ${this.getSubCategoryLabel(product.category, product.subCategory)}</p>
                    <p>价格: ${product.price} peso</p>
                    <p>颜色: ${product.colors.map(c => c.name).join(', ')}</p>
                </div>
                <div class="product-actions">
                    <button class="edit-btn" onclick="editProduct('${product.id}')">
                        <i class="fas fa-edit"></i> 编辑
                    </button>
                    <button class="delete-btn" onclick="deleteProduct('${product.id}')">
                        <i class="fas fa-trash"></i> 删除
                    </button>
                </div>
            </div>
        `).join('');
    }

    // 获取分类标签
    getCategoryLabel(category) {
        const categoryMap = {
            bags: '包包系列',
            wallets: '钱包系列',
            luggage: '行李箱系列',
            hats: '帽子系列'
        };
        return categoryMap[category] || category;
    }

    // 获取子分类标签
    getSubCategoryLabel(category, subCategory) {
        const categories = window.productCategories[category] || [];
        const subCategoryItem = categories.find(item => item.value === subCategory);
        return subCategoryItem ? subCategoryItem.label : subCategory;
    }
} 