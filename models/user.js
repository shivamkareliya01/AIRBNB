const mongoose = require("mongoose");

const _plm = require("passport-local-mongoose");
const passportLocalMongoose =
  typeof _plm === "function" ? _plm :
  typeof _plm.default === "function" ? _plm.default :
  _plm.default?.default || _plm;

const Schema = mongoose.Schema;

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
  },
});

userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);