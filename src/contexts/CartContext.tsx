import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

export type CartItemType = 'product' | 'donation' | 'membership' | 'project_donation';

export interface CartItem {
    id: string; // unique random id for cart management
    type: CartItemType;
    title: string;
    qty: number;
    unitPrice: number;
    productId?: string;
    variantId?: string;
    projectId?: string;
    image?: string;
    metadata?: any;
}

interface CartContextType {
    items: CartItem[];
    addToCart: (item: Omit<CartItem, 'id'>) => void;
    removeFromCart: (id: string) => void;
    updateQty: (id: string, qty: number) => void;
    updateAmount: (id: string, amount: number) => void;
    clearCart: () => void;
    subtotal: number;
    itemCount: number;
    isCartOpen: boolean;
    setCartOpen: (open: boolean) => void;
    setIsDrawerOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [items, setItems] = useState<CartItem[]>(() => {
        try {
            const saved = localStorage.getItem('rotary_cart');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const [isCartOpen, setCartOpen] = useState(false);

    const setIsDrawerOpen = setCartOpen;

    useEffect(() => {
        localStorage.setItem('rotary_cart', JSON.stringify(items));
    }, [items]);

    const addToCart = (newItem: Omit<CartItem, 'id'>) => {
        setItems(prev => {
            // Check if product already exists (to increase qty)
            if (newItem.type === 'product' && newItem.productId) {
                const existing = prev.find(i => i.type === 'product' && i.productId === newItem.productId && i.variantId === newItem.variantId);
                if (existing) {
                    return prev.map(i => i.id === existing.id ? { ...i, qty: i.qty + (newItem.qty || 1) } : i);
                }
            }

            // Generate a random ID for the cart item
            const id = Math.random().toString(36).substring(2, 9);
            return [...prev, { ...newItem, id, qty: newItem.qty || 1 }];
        });

        toast.success(newItem.type === 'product' ? 'Producto agregado al carrito' : 'Aporte agregado al carrito');
        setCartOpen(true);
    };

    const removeFromCart = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id));
    };

    const updateQty = (id: string, qty: number) => {
        if (qty <= 0) {
            removeFromCart(id);
            return;
        }
        setItems(prev => prev.map(item => item.id === id ? { ...item, qty } : item));
    };

    const updateAmount = (id: string, amount: number) => {
        if (amount < 1) return;
        setItems(prev => prev.map(item => item.id === id ? { ...item, unitPrice: amount } : item));
    };

    const clearCart = () => {
        setItems([]);
    };

    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
    const itemCount = items.reduce((sum, item) => sum + item.qty, 0);

    return (
        <CartContext.Provider value={{
            items,
            addToCart,
            removeFromCart,
            updateQty,
            updateAmount,
            clearCart,
            subtotal,
            itemCount,
            isCartOpen,
            setCartOpen,
            setIsDrawerOpen
        }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) throw new Error('useCart must be used within a CartProvider');
    return context;
};
