import * as Yup from "yup";
import jwt from "jsonwebtoken";
import authConf from "../../config/auth";
import User from "../models/User";
import File from "../models/File";

class SessionController {
  async store(req, res) {
    const schema = Yup.object().shape({
      email: Yup.string().email().required(),
      password: Yup.string().required(),
    });

    if (!(await schema.isValid(req.body)))
      return res.status(400).json({ error: "Validação falha" });

    const { email, password } = req.body;

    const user = await User.findOne({
      where: { email },
      include: [
        { model: File, as: "avatar", attributes: ["id", "path", "url"] },
      ],
    });

    if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

    if (!(await user.checkPassword(password)))
      return res.status(401).json({ error: "Senha não corresponde!" });

    const { id, name, phone, avatar, provider } = user;

    return res.json({
      user: {
        id,
        name,
        phone,
        email,
        avatar,
        provider,
      },
      token: jwt.sign({ id }, authConf.secret, {
        expiresIn: authConf.expiresIn,
      }),
    });
  }
}

export default new SessionController();