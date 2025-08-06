

module.exports = {

    routes: [
        // Add a new custom route here
        {
            method: 'GET',
            path: '/product-variants/of-product/:id', // Changed the path to be unique and clear
            handler: 'product-variant.findProductVariants',
            config: {
                auth: false, // Set to true if authentication is required
                policies: [],
            }
        },
    ]
}