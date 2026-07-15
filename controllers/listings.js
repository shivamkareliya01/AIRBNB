const Listing = require("../models/listing.js");
const ExpressError = require("../utils/ExpressError.js");
const https = require("https");
const crypto = require("crypto");
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken });


const uploadToCloudinary = (fileBuffer, mimetype) => {
    return new Promise((resolve, reject) => {
        const cloudName = process.env.CLOUD_NAME;
        const apiKey = process.env.CLOUD_API_KEY;
        const apiSecret = process.env.CLOUD_API_SECRET;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const folder = "wanderlust_DEV";

        // Generate signature (params must be alphabetical)
        const signatureStr = `folder=${folder}&format=jpg&timestamp=${timestamp}${apiSecret}`;
        const signature = crypto
            .createHash("sha1")
            .update(signatureStr)
            .digest("hex");

        // Build multipart form data
        const boundary = "----CloudinaryBoundary" + Date.now();
        const fields = {
            api_key: apiKey,
            timestamp: timestamp,
            signature: signature,
            folder: folder,
            format: "jpg",
        };

        let body = "";
        for (const [key, value] of Object.entries(fields)) {
            body += `--${boundary}\r\n`;
            body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
            body += `${value}\r\n`;
        }

        // File field
        const fileHeader =
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="upload.jpg"\r\n` +
            `Content-Type: ${mimetype}\r\n\r\n`;
        const fileFooter = `\r\n--${boundary}--\r\n`;

        const headerBuffer = Buffer.from(body + fileHeader, "utf8");
        const footerBuffer = Buffer.from(fileFooter, "utf8");
        const fullBody = Buffer.concat([headerBuffer, fileBuffer, footerBuffer]);

        const options = {
            hostname: "api.cloudinary.com",
            port: 443,
            path: `/v1_1/${cloudName}/image/upload`,
            method: "POST",
            headers: {
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                "Content-Length": fullBody.length,
            },
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                console.log("Cloudinary upload:", res.statusCode === 200 ? "success" : "failed (" + res.statusCode + ")");

                if (res.statusCode === 200) {
                    try {
                        const result = JSON.parse(data);
                        resolve(result);
                    } catch (e) {
                        reject(new Error("Failed to parse Cloudinary response"));
                    }
                } else {
                    reject(new Error(`Cloudinary upload failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on("error", (err) => {
            reject(err);
        });

        req.write(fullBody);
        req.end();
    });
};

module.exports.index = async (req, res) => {
    const allListings = await Listing.find({});

    res.render("listings/index", { allListings });
};

module.exports.renderNew = (req, res) => {
    res.render("listings/new");
};

module.exports.showListing = async (req, res) => {
    const { id } = req.params;

    const listing = await Listing.findById(id)
        .populate({
            path: "reviews",
            populate: {
                path: "author",
            },
        })
        .populate("owner");

    if (!listing) {
        req.flash(
            "error",
            "Listing you requested does not exist!"
        );

        return res.redirect("/listings");
    }

    res.render("listings/show", { listing });
};

module.exports.createListing = async (req, res) => {
    let response = await geocodingClient
        .forwardGeocode({
            query: req.body.listing.location,
            limit: 1,
        })
        .send();

    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;

    newListing.geometry = response.body.features[0].geometry;


    if (req.file) {
        const result = await uploadToCloudinary(
            req.file.buffer,
            req.file.mimetype
        );

        newListing.image = {
            url: result.secure_url,
            filename: result.public_id,
        };
    }

    let savedListing = await newListing.save();
    console.log(savedListing);

    req.flash(
        "success",
        "New Listing Created!"
    );

    res.redirect("/listings");
};

module.exports.renderEditForm = async (req, res) => {
    const { id } = req.params;

    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash(
            "error",
            "Listing you requested does not exist!"
        );

        return res.redirect("/listings");
    }
    let originalImageUrl = listing.image.url;
    originalImageUrl = originalImageUrl.replace("/upload", "/upload/h_300,w_250");
    res.render("listings/edit", { listing, originalImageUrl });
};

module.exports.updateListing = async (req, res) => {
    const { id } = req.params;

    let listing = await Listing.findByIdAndUpdate(
        id,
        req.body.listing,
        {
            new: true,
            runValidators: true,
        }
    );

    // Re-geocode the location to update map coordinates
    let response = await geocodingClient
        .forwardGeocode({
            query: listing.location,
            limit: 1,
        })
        .send();

    if (response.body.features.length > 0) {
        listing.geometry = response.body.features[0].geometry;
    }

    if (typeof req.file !== "undefined") {
        const result = await uploadToCloudinary(
            req.file.buffer,
            req.file.mimetype
        );
        listing.image = {
            url: result.secure_url,
            filename: result.public_id,
        };
    }

    await listing.save();

    req.flash(
        "success",
        "Listing Updated!"
    );

    res.redirect(`/listings/${id}`);
};


module.exports.destroyListing = async (req, res) => {
    const { id } = req.params;

    const deletedListing =
        await Listing.findByIdAndDelete(id);

    if (!deletedListing) {
        throw new ExpressError(
            404,
            "Listing not found"
        );
    }

    req.flash("success", "Listing Deleted!");

    res.redirect("/listings");
};