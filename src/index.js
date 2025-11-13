
const fs = require("fs");
const axios = require("axios");


async function getAllListings() {
    // Fetch both sell and buy listings in parallel for better performance
    const [sellListings, buyListings] = await Promise.all([
        getSellListings(),
        getBuyListings()
    ]);

    // Merge both arrays into a single array
    const allListings = [...sellListings, ...buyListings];

    // Sort by created_at timestamp (newest first)
    allListings.sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return allListings;
}


async function getSellListings() {

    let url = "https://metaforge.app/api/arc-raiders/trade/listings?page=1&limit=10&sortBy=created_at&sortOrder=desc&listing_type=sell"

    let request = await axios({
        url,
    })

    let parsed = request.data.data.map(data => {


        let buying = {
            id: data.price != null ? "assorted-seeds" : data.wanted_item_id,
            amount: data.price != null ? data.price : data.wanted_quantity,
            name: data.price != null ? "Assorted Seeds" : data.wanted_item.name,
            icon: data.price != null ? "https://cdn.metaforge.app/arc-raiders/icons/assorted-seeds.webp" : data.wanted_item.icon
        }

        return {
            id: data.id,
            type: data.listing_type,
            user_id: data.user_id,
            status: data.status,
            description: data.description,
            created_at: data.created_at,
            updated_at: data.updated_at,

            selling: { id: data.item_id, amount: data.quantity, name: data.item.name, icon: data.item.icon },
            buying,

            user_profile: data.user_profile
        }

    })

    return parsed;

}

async function getBuyListings() {
    let url = "https://metaforge.app/api/arc-raiders/trade/listings?page=1&limit=10&sortBy=created_at&sortOrder=desc&listing_type=buy"

    let request = await axios({
        url,
    })

    let parsed = request.data.data.map(data => {

        let selling = {
            id: data.price != null ? "assorted-seeds" : data.wanted_item_id,
            amount: data.price != null ? data.price : data.wanted_quantity,
            name: data.price != null ? "Assorted Seeds" : data.wanted_item.name,
            icon: data.price != null ? "https://cdn.metaforge.app/arc-raiders/icons/assorted-seeds.webp" : data.wanted_item.icon
        }

        return {
            id: data.id,
            type: data.listing_type,
            user_id: data.user_id,
            status: data.status,
            description: data.description,
            created_at: data.created_at,
            updated_at: data.updated_at,

            buying: { id: data.item_id, amount: data.quantity, name: data.item.name, icon: data.item.icon },
            selling,

            user_profile: data.user_profile
        }

    })

    return parsed;
}

getAllListings().then(data => fs.writeFileSync("data-example.json", JSON.stringify(data, null, 2)))

// Export functions for use in other modules
module.exports = {
    getAllListings,
    getSellListings,
    getBuyListings
};

