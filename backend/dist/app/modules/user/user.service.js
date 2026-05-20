"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const user_1 = require("../../../enums/user");
const api_error_1 = __importDefault(require("../../../errors/api_error"));
const user_model_1 = require("./user.model");
const http_status_1 = __importDefault(require("http-status"));
const getAllUsers = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.find({});
    return result;
});
const getUser = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.findOne({ _id: payload });
    return result;
});
const updateUser = (token, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.findOneAndUpdate({ email: token.email }, payload, {
        new: true,
        runValidators: true,
    });
    return result;
});
const deleteUser = (id) => __awaiter(void 0, void 0, void 0, function* () {
    yield user_model_1.User.deleteOne({ _id: id });
});
const applyForWriter = (token) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = token;
    const user = yield user_model_1.User.findOne({
        email: email,
    });
    if (!user) {
        throw new api_error_1.default(http_status_1.default.BAD_REQUEST, "User not found!");
    }
    if (user.isApplyForWriter) {
        throw new api_error_1.default(http_status_1.default.BAD_REQUEST, "You have already applied for writer!");
    }
    const result = yield user_model_1.User.findOneAndUpdate({ email: email }, { isApplyForWriter: true }, {
        new: true,
        runValidators: true,
    });
    return result;
});
const approveWriterApplication = (email) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const isExistUser = yield user_model_1.User.findOne({ email: email });
        if (!isExistUser) {
            throw new api_error_1.default(http_status_1.default.NOT_FOUND, "User not found!");
        }
        if (isExistUser.role === user_1.ENUM_USER_ROLE.WRITER) {
            throw new api_error_1.default(http_status_1.default.BAD_REQUEST, "User is already a writer!");
        }
        const result = yield user_model_1.User.findOneAndUpdate({ email: email }, { role: user_1.ENUM_USER_ROLE.WRITER }, {
            new: true,
            runValidators: true,
        });
        if (result) {
            // const io = getIO();
            // const notificationMessage = {
            //   type: "success" as "success",
            //   data: {
            //     title: "Approval Notice",
            //     message: "Your writer application has been approved.",
            //   },
            //   email,
            // };
            // io.on("adminMessage", async () => {
            //   await NotificationService.createNotification(notificationMessage);
            //   sendNotification("pushNotification", notificationMessage);
            // });
        }
        return result;
    }
    catch (error) {
        if (error instanceof Error) {
            throw new api_error_1.default(http_status_1.default.BAD_REQUEST, error.message);
        }
        else {
            throw new api_error_1.default(http_status_1.default.BAD_REQUEST, "An unknown error occurred");
        }
    }
});
const getAllWriterApplicationUsers = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.find({ isApplyForWriter: true });
    return result;
});
const getProfileInfo = (token) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = token;
    const user = yield user_model_1.User.findOne({
        email: email,
    });
    if (!user) {
        throw new api_error_1.default(http_status_1.default.BAD_REQUEST, "User not found!");
    }
    return user;
});
const toggleFollow = (token, authorId) => __awaiter(void 0, void 0, void 0, function* () {
    const currentUser = yield user_model_1.User.findOne({ email: token.email });
    if (!currentUser) {
        throw new api_error_1.default(http_status_1.default.BAD_REQUEST, "User not found!");
    }
    const author = yield user_model_1.User.findById(authorId);
    if (!author) {
        throw new api_error_1.default(http_status_1.default.BAD_REQUEST, "Author not found!");
    }
    const isFollowing = currentUser.following.includes(author._id);
    if (isFollowing) {
        // Unfollow
        yield user_model_1.User.findByIdAndUpdate(currentUser._id, {
            $pull: { following: author._id },
        });
        yield user_model_1.User.findByIdAndUpdate(author._id, {
            $pull: { followers: currentUser._id },
        });
        return { isFollowing: false };
    }
    else {
        // Follow
        yield user_model_1.User.findByIdAndUpdate(currentUser._id, {
            $addToSet: { following: author._id },
        });
        yield user_model_1.User.findByIdAndUpdate(author._id, {
            $addToSet: { followers: currentUser._id },
        });
        return { isFollowing: true };
    }
});
const getFollowStatus = (token, authorId) => __awaiter(void 0, void 0, void 0, function* () {
    const currentUser = yield user_model_1.User.findOne({ email: token.email });
    if (!currentUser) {
        return { isFollowing: false };
    }
    const isFollowing = currentUser.following.some((id) => id.toString() === authorId);
    return { isFollowing };
});
exports.UserService = {
    getAllUsers,
    getUser,
    updateUser,
    deleteUser,
    getProfileInfo,
    applyForWriter,
    approveWriterApplication,
    getAllWriterApplicationUsers,
    toggleFollow,
    getFollowStatus,
};
